export function normalizeCoverIsbn(value) {
  return String(value ?? '').toUpperCase().replace(/^\s*ISBN(?:-1[03])?\s*[:_-]?\s*/i, '').replace(/[^0-9X]/g, '');
}

function fileKey(filename) {
  const stem = String(filename ?? '').replace(/\.[^.]+$/, '').trim();
  const isbn = normalizeCoverIsbn(stem);
  return { stem, isbn: /^(?:\d{10}|\d{13}|\d{9}X)$/.test(isbn) ? isbn : '' };
}

export function matchCoverFiles(files, books) {
  const matchedBooks = new Map();
  const initial = files.map((file) => {
    const { stem, isbn } = fileKey(file.name);
    const byId = books.filter((book) => String(book.id) === stem);
    const candidates = byId.length ? byId : isbn ? books.filter((book) => normalizeCoverIsbn(book.isbn) === isbn) : [];
    if (candidates.length === 1) {
      const ids = matchedBooks.get(candidates[0].id) ?? [];
      ids.push(file.name);
      matchedBooks.set(candidates[0].id, ids);
      return { fileName: file.name, status: 'matched', book: candidates[0] };
    }
    return { fileName: file.name, status: candidates.length > 1 ? 'ambiguous' : 'unmatched', book: null };
  });
  return initial.map((entry) => entry.status === 'matched' && (matchedBooks.get(entry.book.id)?.length ?? 0) > 1
    ? { ...entry, status: 'ambiguous', book: null, reason: 'Hay varias imágenes para el mismo libro.' }
    : entry);
}
