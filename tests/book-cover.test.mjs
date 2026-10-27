import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCoverImageUrl } from '../src/services/books/coverImage.mjs';
import { assessCoverDimensions, COVER_STORED_MAX_BYTES, COVER_UPLOAD_MAX_BYTES, validateCoverUploadFile } from '../src/services/books/coverUpload.mjs';

test('accepts HTTPS image URLs with query parameters', () => {
  assert.equal(
    resolveCoverImageUrl('https://images.example.org/cover.jpg?width=600'),
    'https://images.example.org/cover.jpg?width=600',
  );
});

test('rejects non-HTTPS URLs and direct PDF/document preview links', () => {
  assert.equal(resolveCoverImageUrl('http://images.example.org/cover.jpg'), '');
  assert.equal(resolveCoverImageUrl('https://cdn.example.org/book.pdf'), '');
  assert.equal(resolveCoverImageUrl('https://drive.google.com/file/d/example/view'), '');
  assert.equal(resolveCoverImageUrl('https://docs.google.com/document/d/example/preview'), '');
});

test('rejects using the same URL as the book document link', () => {
  const documentUrl = 'https://cdn.example.org/books/thermal-physics';
  assert.equal(resolveCoverImageUrl(documentUrl, documentUrl), '');
});

test('permite JPG, PNG y WebP dentro del límite de origen', () => {
  for (const [name, type] of [['cover.jpg', 'image/jpeg'], ['cover.png', 'image/png'], ['cover.webp', 'image/webp']]) {
    assert.deepEqual(validateCoverUploadFile({ name, type, size: 1024 }), { valid: true, reason: '' });
  }
  assert.equal(COVER_UPLOAD_MAX_BYTES, 10 * 1024 * 1024);
  assert.equal(COVER_STORED_MAX_BYTES, 2 * 1024 * 1024);
  assert.equal(validateCoverUploadFile({ name: 'large.png', type: 'image/png', size: COVER_STORED_MAX_BYTES + 1 }).valid, true);
});

test('rechaza tipos no compatibles, MIME que no coincide y archivos mayores a 10 MB', () => {
  assert.equal(validateCoverUploadFile({ name: 'cover.gif', type: 'image/gif', size: 1024 }).valid, false);
  assert.equal(validateCoverUploadFile({ name: 'cover.jpg', type: 'image/png', size: 1024 }).valid, false);
  assert.match(validateCoverUploadFile({ name: 'cover.webp', type: 'image/webp', size: COVER_UPLOAD_MAX_BYTES + 1 }).reason, /10 MB/);
});

test('advierte por baja resolución y proporción horizontal sin modificar dimensiones', () => {
  assert.deepEqual(assessCoverDimensions(128, 168), { valid: true, isPortrait: true, lowResolution: true, requiresConfirmation: true });
  assert.equal(assessCoverDimensions(800, 1200).requiresConfirmation, false);
  assert.deepEqual(assessCoverDimensions(900, 600), { valid: true, isPortrait: false, lowResolution: false, requiresConfirmation: true });
  assert.equal(assessCoverDimensions(0, 0).valid, false);
});
