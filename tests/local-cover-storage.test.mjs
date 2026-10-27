import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { checkPublished, localCoverStoragePlugin, pagesUrl, publishCoverBatch, saveBulkCover, saveCover, verifyAdminToken } from '../scripts/local-cover-storage-plugin.mjs';
import { matchCoverFiles } from '../src/services/books/bulkCoverMatching.mjs';

const projectId = 'demo-masterfull-library-rules';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
jwk.kid = 'test-local-cover-key';

function makeToken(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: jwk.kid })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({
    aud: projectId,
    iss: `https://securetoken.google.com/${projectId}`,
    sub: 'admin-test-uid',
    iat: now,
    exp: now + 3600,
    email_verified: true,
    admin: true,
    ...overrides,
  })).toString('base64url');
  const input = `${header}.${claims}`;
  const signature = sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url');
  return `${input}.${signature}`;
}

test('GitHub Pages URLs preserve the repository base path', () => {
  assert.equal(pagesUrl('https://masterfullgroup.github.io/masterfull-library/', 'sample.jpg'), 'https://masterfullgroup.github.io/masterfull-library/portadas/sample.jpg');
  assert.throws(() => pagesUrl('http://example.test/', 'sample.jpg'), /HTTPS/);
  assert.throws(() => pagesUrl('https://example.test/base', 'sample.jpg'), /termine en/);
});

test('local cover endpoint exists only in Vite dev and binds to configured plugin', () => {
  const plugin = localCoverStoragePlugin({ root: process.cwd(), projectId, pagesBaseUrl: 'https://masterfullgroup.github.io/masterfull-library/' });
  assert.equal(plugin.apply, 'serve');
  assert.equal(typeof plugin.configureServer, 'function');
});

test('blocks requests from external pages before reading an upload', async () => {
  const plugin = localCoverStoragePlugin({ root: process.cwd(), projectId, pagesBaseUrl: 'https://masterfullgroup.github.io/masterfull-library/' });
  let middleware;
  plugin.configureServer({ middlewares: { use(handler) { middleware = handler; } } });
  const req = Object.assign(new EventEmitter(), {
    url: '/__local-covers/save',
    method: 'POST',
    headers: { origin: 'https://attacker.invalid', 'sec-fetch-site': 'cross-site', 'content-type': 'application/json' },
    socket: { remoteAddress: '127.0.0.1' },
  });
  const result = await new Promise((resolve) => {
    const headers = {};
    const res = { setHeader(key, value) { headers[key] = value; }, end(body) { resolve({ status: this.statusCode, headers, body: JSON.parse(body) }); } };
    middleware(req, res, () => resolve({ next: true }));
  });
  assert.equal(result.status, 403);
  assert.match(result.body.error, /vista previa local/);
});

test('saves supported image bytes to a unique safe path without overwriting', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'masterfull-cover-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const payload = { fileName: 'cover.png', contentType: 'image/png', dataBase64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2]).toString('base64') };
  const first = await saveCover(root, payload, 'https://masterfullgroup.github.io/masterfull-library/');
  const second = await saveCover(root, payload, 'https://masterfullgroup.github.io/masterfull-library/');
  assert.notEqual(first.filename, second.filename);
  assert.match(first.localPath, /^public\/portadas\/[a-f0-9-]{36}\.png$/);
  assert.equal(first.pagesUrl, `https://masterfullgroup.github.io/masterfull-library/${first.localPath.replace('public/', '')}`);
  assert.deepEqual(await readFile(path.join(root, first.localPath)), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2]));
});

test('bulk cover saves are content-addressed and retries do not create duplicate files', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'masterfull-cover-bulk-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const payload = { fileName: '978013-123456.png', contentType: 'image/png', dataBase64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2]).toString('base64') };
  const first = await saveBulkCover(root, payload, 'https://masterfullgroup.github.io/masterfull-library/');
  const retry = await saveBulkCover(root, payload, 'https://masterfullgroup.github.io/masterfull-library/');
  assert.equal(first.filename, retry.filename);
  assert.equal(first.duplicate, false);
  assert.equal(retry.duplicate, true);
  assert.match(first.filename, /^[a-f0-9]{64}\.png$/);
  assert.equal(first.sha256, first.filename.slice(0, 64));
});

test('bulk matching only uses exact ISBN or exact book ID and flags multiple images as ambiguous', () => {
  const books = [{ id: 'book-1', isbn: '978-0-13-123456-7', title: 'Physics' }, { id: 'book-2', isbn: '9780000000002', title: 'Other' }];
  const result = matchCoverFiles([{ name: 'ISBN_9780131234567.jpg' }, { name: 'book-1.png' }, { name: 'some-physics-book.jpg' }], books);
  assert.deepEqual(result.map((entry) => entry.status), ['ambiguous', 'ambiguous', 'unmatched']);
  const exact = matchCoverFiles([{ name: 'book-2.webp' }], books);
  assert.equal(exact[0].status, 'matched');
  assert.equal(exact[0].book.id, 'book-2');
});

test('rejects MIME/signature mismatch, malformed payload and files over 2 MB', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'masterfull-cover-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const base = { fileName: 'cover.png', contentType: 'image/png', dataBase64: Buffer.from('not a png').toString('base64') };
  await assert.rejects(saveCover(root, base, 'https://masterfullgroup.github.io/masterfull-library/'), /no coincide/);
  await assert.rejects(saveCover(root, { ...base, fileName: '../cover.png', dataBase64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64') }, 'https://masterfullgroup.github.io/masterfull-library/'), /nombre|válido/i);
  await assert.rejects(saveCover(root, { ...base, dataBase64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, ...new Array(2 * 1024 * 1024).fill(1)]).toString('base64') }, 'https://masterfullgroup.github.io/masterfull-library/'), /2 MB/);
});

test('requires a signed, verified admin token and an active Firestore profile', async (t) => {
  const originalFetch = globalThis.fetch;
  let profileActive = true;
  let firestoreRequests = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes('securetoken@system.gserviceaccount.com')) {
      return new Response(JSON.stringify({ keys: [jwk] }), { status: 200, headers: { 'cache-control': 'max-age=3600' } });
    }
    firestoreRequests += 1;
    assert.match(url, /usuarios\/admin-test-uid$/);
    return new Response(JSON.stringify({ fields: { activo: { booleanValue: profileActive } } }), { status: 200 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  await assert.rejects(verifyAdminToken(makeToken({ admin: false }), projectId), /admin: true/);
  assert.equal(firestoreRequests, 0);
  await assert.rejects(verifyAdminToken(makeToken({ email_verified: false }), projectId), /admin: true/);
  profileActive = false;
  await assert.rejects(verifyAdminToken(makeToken(), projectId), /perfil activo/);
  profileActive = true;
  assert.equal(await verifyAdminToken(makeToken(), projectId), 'admin-test-uid');
});

test('does not report publication unless Pages responds with an image', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'masterfull-cover-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const saved = await saveCover(root, { fileName: 'cover.png', contentType: 'image/png', dataBase64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64') }, 'https://masterfullgroup.github.io/masterfull-library/');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.method, 'GET');
    return new Response(null, { status: 404, headers: { 'content-type': 'text/html' } });
  };
  try {
    const result = await checkPublished(root, saved.filename, 'https://masterfullgroup.github.io/masterfull-library/');
    assert.equal(result.published, false);
    assert.equal(result.status, 404);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('confirms Pages serves exactly the local image bytes', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'masterfull-cover-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 2, 3]);
  const saved = await saveBulkCover(root, { fileName: 'cover.png', contentType: 'image/png', dataBase64: bytes.toString('base64') }, 'https://masterfullgroup.github.io/masterfull-library/');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => { assert.equal(options.method, 'GET'); return new Response(bytes, { status: 200, headers: { 'content-type': 'image/png' } }); };
  try {
    const result = await checkPublished(root, saved.filename, 'https://masterfullgroup.github.io/masterfull-library/');
    assert.equal(result.published, true);
    assert.equal(result.sha256, saved.sha256);
  } finally { globalThis.fetch = originalFetch; }
});

test('batch Git publication stages, commits and pushes only validated cover paths', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'masterfull-cover-git-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const saved = await saveBulkCover(root, { fileName: 'cover.png', contentType: 'image/png', dataBase64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64') }, 'https://masterfullgroup.github.io/masterfull-library/');
  const calls = [];
  const runGit = async (args) => {
    calls.push(args);
    if (args[0] === 'branch') return { stdout: 'main\n' };
    if (args[0] === 'remote') return { stdout: 'https://github.com/masterfullgroup/masterfull-library.git\n' };
    if (args[0] === 'rev-parse') return { stdout: 'same-commit\n' };
    return { stdout: '' };
  };
  const result = await publishCoverBatch(root, [saved.filename], { runGit });
  assert.equal(result.published, true);
  assert.deepEqual(calls.slice(-3), [
    ['add', '--', `public/portadas/${saved.filename}`],
    ['commit', '--only', '-m', 'Publicar 1 portada(s)', '--', `public/portadas/${saved.filename}`],
    ['push', 'origin', 'main'],
  ]);
});

test('batch Git publication refuses non-main, wrong repository and unpushed history', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'masterfull-cover-git-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const saved = await saveBulkCover(root, { fileName: 'cover.png', contentType: 'image/png', dataBase64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64') }, 'https://masterfullgroup.github.io/masterfull-library/');
  const run = (branch, remote, heads) => async (args) => {
    if (args[0] === 'branch') return { stdout: `${branch}\n` };
    if (args[0] === 'remote') return { stdout: `${remote}\n` };
    return { stdout: `${heads.shift()}\n` };
  };
  await assert.rejects(publishCoverBatch(root, [saved.filename], { runGit: run('feature', 'https://github.com/masterfullgroup/masterfull-library.git', []) }), /rama main/);
  await assert.rejects(publishCoverBatch(root, [saved.filename], { runGit: run('main', 'https://github.com/unrelated/project.git', []) }), /remoto origin/);
  await assert.rejects(publishCoverBatch(root, [saved.filename], { runGit: run('main', 'https://github.com/masterfullgroup/masterfull-library.git', ['local', 'remote']) }), /commits locales pendientes/);
});
