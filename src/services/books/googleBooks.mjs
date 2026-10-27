const API_URL = 'https://www.googleapis.com/books/v1/volumes';
const CACHE_TTL_MS = 3 * 60 * 1000;
const responseCache = new Map();
const inflight = new Map();
const IMAGE_HOSTS = new Set(['books.google.com', 'books.googleusercontent.com']);
const IMAGE_SIZES = ['extraLarge', 'large', 'medium', 'small', 'thumbnail', 'smallThumbnail'];
const IMAGE_SIZE_WIDTHS = { extraLarge: 1280, large: 800, medium: 575, small: 300, thumbnail: 128, smallThumbnail: 80 };
const OPEN_LIBRARY_API = 'https://openlibrary.org/api/books';
const OPEN_LIBRARY_COVERS = 'https://covers.openlibrary.org';
const OPEN_LIBRARY_COVER_SIZES = ['large', 'medium', 'small'];

export function selectLargestCoverByDimensions(covers) {
  const valid = [...covers].filter((cover) => Number.isFinite(cover?.width) && cover.width > 0 && Number.isFinite(cover?.height) && cover.height > 0);
  const portraitCovers = valid.filter((cover) => cover.width / cover.height >= 0.45 && cover.width / cover.height <= 1.05);
  return [...(portraitCovers.length ? portraitCovers : valid)]
    .sort((left, right) => right.width * right.height - left.width * left.height)[0] ?? null;
}

export function normalizeIsbn(value) {
  const isbn = String(value ?? '').replace(/[^0-9x]/gi, '').toUpperCase();
  if (isbn.length === 13 && /^\d{13}$/.test(isbn)) {
    const sum = [...isbn.slice(0, 12)].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
    return (10 - (sum % 10)) % 10 === Number(isbn[12]) ? isbn : '';
  }
  if (isbn.length === 10 && /^\d{9}[\dX]$/.test(isbn)) {
    const sum = [...isbn].reduce((total, character, index) => total + (character === 'X' ? 10 : Number(character)) * (10 - index), 0);
    return sum % 11 === 0 ? isbn : '';
  }
  return '';
}

function normalizedText(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeCoverUrl(value) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    if (url.protocol === 'http:' && IMAGE_HOSTS.has(host)) url.protocol = 'https:';
    if (url.protocol !== 'https:' || !IMAGE_HOSTS.has(host) || !url.pathname.startsWith('/books/content')) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function getGoogleCoverOptions(imageLinks = {}) {
  return IMAGE_SIZES.flatMap((size) => {
    const url = normalizeCoverUrl(imageLinks[size]);
    return url ? [{ size, widthHint: IMAGE_SIZE_WIDTHS[size], url, source: 'Google Books' }] : [];
  });
}

function normalizeOpenLibraryCoverUrl(value) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'covers.openlibrary.org' || !/^\/b\/(?:id|isbn)\/[\w-]+-[SML]\.jpg$/i.test(url.pathname)) return '';
    url.searchParams.set('default', 'false');
    return url.toString();
  } catch {
    return '';
  }
}

function matchesOpenLibraryEdition(volume, { isbn, title, author }) {
  if (!volume || typeof volume !== 'object') return false;
  const identifiers = volume.identifiers ?? {};
  const openLibraryIsbns = [...(identifiers.isbn_10 ?? []), ...(identifiers.isbn_13 ?? [])].map(normalizeIsbn).filter(Boolean);
  if (!openLibraryIsbns.includes(isbn)) return false;
  const expectedTitle = normalizedText(title);
  const volumeTitle = normalizedText(volume.title);
  if (!expectedTitle || !volumeTitle || !(volumeTitle.includes(expectedTitle) || expectedTitle.includes(volumeTitle))) return false;
  const expectedAuthors = normalizedText(author).split(' ').filter(Boolean);
  const returnedAuthors = Array.isArray(volume.authors) ? volume.authors.map((entry) => normalizedText(entry?.name)) : [];
  return expectedAuthors.length > 0 && returnedAuthors.some((returned) => expectedAuthors.every((word) => returned.includes(word)));
}

async function getOpenLibraryCoverOptions({ isbn, title, author, signal, fetchImpl }) {
  const url = new URL(OPEN_LIBRARY_API);
  url.searchParams.set('bibkeys', `ISBN:${isbn}`);
  url.searchParams.set('format', 'json');
  url.searchParams.set('jscmd', 'data');
  try {
    const response = await fetchImpl(url, { signal });
    if (!response.ok) return [];
    const payload = await response.json();
    const volume = payload?.[`ISBN:${isbn}`];
    if (!matchesOpenLibraryEdition(volume, { isbn, title, author })) return [];
    const cover = volume.cover ?? {};
    return OPEN_LIBRARY_COVER_SIZES.flatMap((size) => {
      const coverUrl = normalizeOpenLibraryCoverUrl(cover[size]);
      return coverUrl ? [{ size, widthHint: 0, url: coverUrl, source: 'Open Library' }] : [];
    });
  } catch {
    // Open Library is only a best-effort edition-specific fallback.
    return [];
  }
}

function asCandidate(item, { isbn, title, author }) {
  const info = item.volumeInfo ?? {};
  const identifiers = Array.isArray(info.industryIdentifiers) ? info.industryIdentifiers : [];
  const candidateIsbns = identifiers.map((identifier) => normalizeIsbn(identifier.identifier)).filter(Boolean);
  const normalizedTitle = normalizedText(title);
  const resultTitle = normalizedText(info.title);
  const normalizedAuthor = normalizedText(author);
  const resultAuthors = Array.isArray(info.authors) ? info.authors : [];
  const titleMatch = Boolean(normalizedTitle && resultTitle && (resultTitle.includes(normalizedTitle) || normalizedTitle.includes(resultTitle)));
  const authorMatch = Boolean(normalizedAuthor && resultAuthors.some((name) => {
    const candidateAuthor = normalizedText(name);
    return candidateAuthor.includes(normalizedAuthor) || normalizedAuthor.includes(candidateAuthor);
  }));

  const googleCoverOptions = getGoogleCoverOptions(info.imageLinks);
  return {
    id: String(item.id ?? `${info.title ?? 'book'}-${candidateIsbns[0] ?? ''}`),
    title: String(info.title ?? 'Título no disponible'),
    authors: resultAuthors,
    publisher: String(info.publisher ?? ''),
    publishedDate: String(info.publishedDate ?? ''),
    identifiers,
    isbns: candidateIsbns,
    isbnMatch: Boolean(isbn && candidateIsbns.includes(isbn)),
    titleMatch,
    authorMatch,
    titleAuthorMatch: titleMatch && authorMatch,
    coverUrl: googleCoverOptions[0]?.url ?? '',
    coverOptions: googleCoverOptions,
    infoLink: typeof info.infoLink === 'string' && /^https:\/\/(books\.google\.com|play\.google\.com)\//.test(info.infoLink) ? info.infoLink : '',
    source: 'Google Books',
  };
}

async function fetchVolumes(query, { apiKey, signal, fetchImpl }) {
  const cacheKey = query.trim().toLocaleLowerCase();
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.items;
  if (inflight.has(cacheKey)) return inflight.get(cacheKey);

  const url = new URL(API_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('maxResults', '10');
  url.searchParams.set('printType', 'books');
  url.searchParams.set('projection', 'lite');
  url.searchParams.set('key', apiKey);
  const request = (async () => {
    const response = await fetchImpl(url, { signal });
    if (!response.ok) {
      let message = '';
      try { message = (await response.json())?.error?.message ?? ''; } catch { /* Ignore non-JSON error bodies. */ }
      const error = new Error(response.status === 429 ? 'Google Books alcanzó su límite temporal de solicitudes.' : message || `Google Books respondió con HTTP ${response.status}.`);
      error.code = response.status === 429 ? 'rate_limit' : 'http_error';
      throw error;
    }
    const payload = await response.json();
    const items = Array.isArray(payload.items) ? payload.items : [];
    responseCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, items });
    return items;
  })();

  inflight.set(cacheKey, request);
  try { return await request; }
  finally { inflight.delete(cacheKey); }
}

export async function searchGoogleBooks({ isbn: rawIsbn = '', title = '', author = '', apiKey = '', signal, fetchImpl = globalThis.fetch }) {
  if (typeof fetchImpl !== 'function') throw new Error('Este navegador no permite realizar la búsqueda.');
  if (!apiKey.trim()) {
    const error = new Error('Falta configurar VITE_GOOGLE_BOOKS_API_KEY para consultar Google Books.');
    error.code = 'missing_api_key';
    throw error;
  }

  const isbnInput = String(rawIsbn).trim();
  const isbn = normalizeIsbn(isbnInput);
  if (isbnInput && !isbn) {
    const error = new Error('El ISBN no es válido. Corrígelo o bórralo para buscar por título y autor.');
    error.code = 'invalid_isbn';
    throw error;
  }
  const cleanTitle = String(title).trim();
  const cleanAuthor = String(author).trim();
  if (!isbn && !cleanTitle && !cleanAuthor) throw new Error('Escribe un ISBN, título o autor antes de buscar.');
  if (!isbn && (!cleanTitle || !cleanAuthor)) throw new Error('Para buscar sin ISBN, completa el título y el autor.');

  let rawItems = [];
  let usedTitleAuthorFallback = false;
  if (isbn) {
    rawItems = await fetchVolumes(`isbn:${isbn}`, { apiKey, signal, fetchImpl });
    const exactWithCover = rawItems.some((item) => {
      const candidate = asCandidate(item, { isbn, title: cleanTitle, author: cleanAuthor });
      return candidate.isbnMatch && candidate.coverUrl;
    });
    if (!exactWithCover && cleanTitle && cleanAuthor) {
      const fallback = await fetchVolumes(`intitle:${cleanTitle} inauthor:${cleanAuthor}`, { apiKey, signal, fetchImpl });
      const seen = new Set(rawItems.map((item) => item.id));
      rawItems = [...rawItems, ...fallback.filter((item) => !seen.has(item.id))];
      usedTitleAuthorFallback = fallback.length > 0;
    }
  } else {
    rawItems = await fetchVolumes(`intitle:${cleanTitle} inauthor:${cleanAuthor}`, { apiKey, signal, fetchImpl });
    usedTitleAuthorFallback = true;
  }

  const candidates = rawItems.map((item) => asCandidate(item, { isbn, title: cleanTitle, author: cleanAuthor }));
  const needsEditionFallback = isbn && cleanTitle && cleanAuthor && candidates.some((candidate) => candidate.isbnMatch && candidate.titleMatch && candidate.authorMatch && candidate.coverOptions.every((option) => option.widthHint < 450));
  if (needsEditionFallback) {
    const openLibraryOptions = await getOpenLibraryCoverOptions({ isbn, title: cleanTitle, author: cleanAuthor, signal, fetchImpl });
    if (openLibraryOptions.length) {
      for (const candidate of candidates) {
        if (!candidate.isbnMatch || !candidate.titleMatch || !candidate.authorMatch || !candidate.coverOptions.every((option) => option.widthHint < 450)) continue;
        candidate.coverOptions = [...openLibraryOptions, ...candidate.coverOptions];
        candidate.coverUrl = candidate.coverOptions[0].url;
      }
    }
  }
  candidates.sort((left, right) => Number(right.isbnMatch) - Number(left.isbnMatch) || Number(right.titleAuthorMatch) - Number(left.titleAuthorMatch));
  return { candidates, usedTitleAuthorFallback, searchedIsbn: isbn };
}
