import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIsbn, searchGoogleBooks, selectLargestCoverByDimensions } from '../src/services/books/googleBooks.mjs';

const ISBN = '9780192895554';
const cover = 'http://books.google.com/books/content?id=thermal-one&printsec=frontcover&img=1&zoom=1';

function jsonResponse(items, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => status >= 400 ? { error: { message: 'provider error' } } : ({ items }) };
}

function volume({ id = 'thermal-one', title = 'An Introduction to Thermal Physics', authors = ['Daniel V. Schroeder'], isbn = ISBN, image = cover, imageLinks } = {}) {
  return { id, volumeInfo: {
    title, authors, publisher: 'Oxford University Press', publishedDate: '2021',
    industryIdentifiers: isbn ? [{ type: 'ISBN_13', identifier: isbn }] : [],
    imageLinks: imageLinks ?? (image ? { thumbnail: image } : {}),
    infoLink: 'https://books.google.com/books?id=thermal-one',
  } };
}

test('valida ISBN-10 e ISBN-13 y rechaza dígitos de control incorrectos', () => {
  assert.equal(normalizeIsbn('978-0-19-289555-4 (edición de tapa blanda)'), ISBN);
  assert.equal(normalizeIsbn('0-19-289555-9'), '0192895559');
  assert.equal(normalizeIsbn('9780192895555'), '');
  assert.equal(normalizeIsbn('123'), '');
});

test('busca por ISBN, verifica identificador y usa imageLinks HTTPS de Google Books', async () => {
  let requested;
  const result = await searchGoogleBooks({ isbn: ISBN, title: 'An Introduction to Thermal Physics', author: 'Daniel V. Schroeder', apiKey: 'public-test-key', fetchImpl: async (url, options) => { if (new URL(url).hostname === 'openlibrary.org') return { ok: true, status: 200, json: async () => ({}) }; requested = { url, options }; return jsonResponse([volume()]); } });
  assert.match(requested.url.searchParams.get('q'), /^isbn:/);
  assert.equal(requested.url.searchParams.get('key'), 'public-test-key');
  assert.equal(result.candidates[0].isbnMatch, true);
  assert.equal(result.candidates[0].titleAuthorMatch, true);
  assert.equal(new URL(result.candidates[0].coverUrl).protocol, 'https:');
  assert.equal(result.usedTitleAuthorFallback, false);
});

test('no escoge una coincidencia automáticamente y devuelve resultados ambiguos para revisión', async () => {
  const result = await searchGoogleBooks({ isbn: '9780306406157', title: 'An Introduction to Thermal Physics', author: 'Daniel V. Schroeder', apiKey: 'test', fetchImpl: async () => jsonResponse([volume({ id: 'thermal-exact', isbn: '9780306406157' }), volume({ id: 'thermal-two', title: 'Thermal Physics', isbn: '9780192895547' })]) });
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates.filter((candidate) => candidate.isbnMatch).length, 1);
});

test('cuando ISBN no encuentra portada, hace una consulta alternativa por título y autor', async () => {
  const queries = [];
  const result = await searchGoogleBooks({ isbn: '9780805371468', title: 'An Introduction to Thermal Physics', author: 'Daniel V. Schroeder', apiKey: 'test', fetchImpl: async (url) => { if (new URL(url).hostname === 'openlibrary.org') return { ok: true, status: 200, json: async () => ({}) }; const q = new URL(url).searchParams.get('q'); queries.push(q); return jsonResponse(q.startsWith('isbn:') ? [volume({ isbn: '9780805371468', image: '' })] : [volume({ id: 'fallback-volume', isbn: '' })]); } });
  assert.equal(queries.length, 2);
  assert.match(queries[1], /^intitle:/);
  assert.equal(result.usedTitleAuthorFallback, true);
  assert.equal(result.candidates.some((candidate) => candidate.id === 'fallback-volume' && candidate.titleAuthorMatch), true);
});

test('la búsqueda por título y autor requiere ambos campos y devuelve cero resultados con claridad', async () => {
  await assert.rejects(() => searchGoogleBooks({ title: 'Thermal physics', apiKey: 'test' }), /completa el título y el autor/);
  const result = await searchGoogleBooks({ title: 'Libro no catalogado', author: 'Autor sin resultados', apiKey: 'test', fetchImpl: async () => jsonResponse([]) });
  assert.equal(result.candidates.length, 0);
});

test('rechaza ISBN inválido antes de hacer llamadas a la API', async () => {
  let called = false;
  await assert.rejects(() => searchGoogleBooks({ isbn: '9780192895555', apiKey: 'test', fetchImpl: async () => { called = true; return jsonResponse([]); } }), /ISBN no es válido/);
  assert.equal(called, false);
});

test('no interpreta enlaces HTML como portadas y reporta errores de red y cuota', async () => {
  const htmlImage = volume({ image: 'https://books.google.com/books/about/Some_Book.html?id=wrong' });
  const noImage = await searchGoogleBooks({ isbn: '9780131103627', title: 'Another Thermal Physics Edition', author: 'Daniel V. Schroeder', apiKey: 'test', fetchImpl: async () => jsonResponse([htmlImage]) });
  assert.equal(noImage.candidates[0].coverUrl, '');

  await assert.rejects(() => searchGoogleBooks({ isbn: '9780192895547', apiKey: 'test', fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }), /Failed to fetch/);
  await assert.rejects(() => searchGoogleBooks({ isbn: '9780316769488', apiKey: 'test', fetchImpl: async () => jsonResponse([], 429) }), /límite temporal/);
});

test('requiere configurar la clave pública sin realizar una llamada si falta', async () => {
  await assert.rejects(() => searchGoogleBooks({ isbn: ISBN, fetchImpl: async () => assert.fail('No debe llamar a fetch') }), /VITE_GOOGLE_BOOKS_API_KEY/);
});

test('deduplica búsquedas concurrentes del mismo ISBN', async () => {
  let calls = 0;
  let release;
  const fetchImpl = async () => {
    calls++;
    await new Promise((resolve) => { release = resolve; });
    return jsonResponse([volume({ isbn: '9780679783268' })]);
  };
  const first = searchGoogleBooks({ isbn: '9780679783268', title: 'Pride and Prejudice', author: 'Jane Austen', apiKey: 'dedup-key', fetchImpl });
  const second = searchGoogleBooks({ isbn: '9780679783268', title: 'Pride and Prejudice', author: 'Jane Austen', apiKey: 'dedup-key', fetchImpl });
  await new Promise((resolve) => setImmediate(resolve));
  release();
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(firstResult.candidates[0].id, secondResult.candidates[0].id);
});

test('conserva y ordena todos los tamaños Google Books sin inventar parámetros de URL', async () => {
  const imageLinks = Object.fromEntries(['smallThumbnail', 'thumbnail', 'small', 'medium', 'large', 'extraLarge'].map((size) => [size, `https://books.google.com/books/content?id=thermal-one&size=${size}`]));
  const result = await searchGoogleBooks({ title: 'All image sizes test edition', author: 'Unique image size author', apiKey: 'sizes-test', fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ items: [volume({ imageLinks, isbn: ISBN, id: 'all-sizes' })] }) }) });
  assert.deepEqual(result.candidates[0].coverOptions.map((option) => option.size), ['extraLarge', 'large', 'medium', 'small', 'thumbnail', 'smallThumbnail']);
  assert.equal(result.candidates[0].coverOptions[0].url, imageLinks.extraLarge);
});

test('elige la imagen comprobada de mayor área y descarta dimensiones inválidas', () => {
  const best = selectLargestCoverByDimensions([
    { url: 'small', width: 80, height: 120 },
    { url: 'large', width: 600, height: 900 },
    { url: 'landscape-scan', width: 300, height: 180 },
    { url: 'broken', width: 0, height: 900 },
  ]);
  assert.equal(best.url, 'large');
  assert.equal(selectLargestCoverByDimensions([{ url: 'broken', width: 0, height: 0 }]), null);
});

test('usa Open Library solo con ISBN, título y autor de la misma edición cuando Google solo ofrece miniaturas', async () => {
  const requests = [];
  const openLibraryCover = 'https://covers.openlibrary.org/b/id/123456-L.jpg';
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    requests.push(parsed.hostname);
    if (parsed.hostname === 'openlibrary.org') return { ok: true, status: 200, json: async () => ({ [`ISBN:${ISBN}`]: { title: 'An Introduction to Thermal Physics', authors: [{ name: 'Daniel V. Schroeder' }], identifiers: { isbn_13: [ISBN] }, cover: { large: openLibraryCover, medium: 'https://covers.openlibrary.org/b/id/123456-M.jpg' } } }) };
    const item = volume({ isbn: ISBN, id: 'thumbnail-edition' });
    return { ok: true, status: 200, json: async () => ({ items: [item] }) };
  };
  const result = await searchGoogleBooks({ isbn: ISBN, title: 'An Introduction to Thermal Physics', author: 'Daniel V. Schroeder', apiKey: 'openlibrary-test', fetchImpl });
  assert.ok(requests.includes('openlibrary.org'));
  assert.equal(result.candidates[0].coverOptions[0].source, 'Open Library');
  assert.match(result.candidates[0].coverOptions[0].url, /default=false/);
});

test('no acepta la portada de Open Library si no se demuestra que corresponde a la misma edición', async () => {
  const fetchImpl = async (url) => {
    if (new URL(url).hostname === 'openlibrary.org') return { ok: true, status: 200, json: async () => ({ [`ISBN:${ISBN}`]: { title: 'Otro libro', authors: [{ name: 'Daniel V. Schroeder' }], identifiers: { isbn_13: [ISBN] }, cover: { large: 'https://covers.openlibrary.org/b/id/123456-L.jpg' } } }) };
    return { ok: true, status: 200, json: async () => ({ items: [volume({ isbn: ISBN, id: 'thumbnail-edition' })] }) };
  };
  const result = await searchGoogleBooks({ isbn: ISBN, title: 'An Introduction to Thermal Physics', author: 'Daniel V. Schroeder', apiKey: 'openlibrary-mismatch', fetchImpl });
  assert.equal(result.candidates[0].coverOptions.some((option) => option.source === 'Open Library'), false);
});
