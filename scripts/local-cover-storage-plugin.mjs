import { createPublicKey, randomUUID, verify as verifySignature } from 'node:crypto';
import { mkdir, open, realpath, lstat } from 'node:fs/promises';
import path from 'node:path';

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_BODY_BYTES = Math.ceil(MAX_FILE_BYTES * 4 / 3) + 16_384;
const FIREBASE_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const allowedTypes = new Map([
  ['image/jpeg', { extension: 'jpg', signature: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff }],
  ['image/png', { extension: 'png', signature: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) }],
  ['image/webp', { extension: 'webp', signature: (b) => b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' }],
]);

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function isLoopback(remoteAddress = '') {
  return remoteAddress === '127.0.0.1' || remoteAddress === '::1' || remoteAddress === '::ffff:127.0.0.1';
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
      } else if (!tooLarge) {
        chunks.push(chunk);
      }
    });
    req.on('end', () => {
      if (tooLarge) return reject(Object.assign(new Error('El archivo supera el límite permitido de 2 MB.'), { status: 413 }));
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('La solicitud no contiene JSON válido.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

let keyCache = { expiresAt: 0, keys: new Map() };
async function getFirebaseKey(kid) {
  if (Date.now() >= keyCache.expiresAt) {
    const response = await fetch(FIREBASE_JWKS_URL);
    if (!response.ok) throw new Error('No se pudo verificar el token de Firebase.');
    const data = await response.json();
    const keys = new Map((data.keys || []).filter((key) => key.kid && key.kty === 'RSA').map((key) => [key.kid, key]));
    const maxAge = Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] || 300);
    keyCache = { expiresAt: Date.now() + Math.min(maxAge, 3600) * 1000, keys };
  }
  const jwk = keyCache.keys.get(kid);
  if (!jwk) throw new Error('El token de Firebase tiene una clave desconocida.');
  return createPublicKey({ key: jwk, format: 'jwk' });
}

export async function verifyAdminToken(token, projectId) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Inicia sesión con la cuenta administradora y vuelve a intentarlo.');
  const [headerPart, payloadPart, signaturePart] = parts;
  const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8'));
  const claims = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
  if (header.alg !== 'RS256' || header.typ !== 'JWT' || typeof header.kid !== 'string') throw new Error('El token de Firebase no es válido.');
  const key = await getFirebaseKey(header.kid);
  const signatureValid = verifySignature('RSA-SHA256', Buffer.from(`${headerPart}.${payloadPart}`), key, Buffer.from(signaturePart, 'base64url'));
  const now = Math.floor(Date.now() / 1000);
  if (!signatureValid || claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}` || !claims.sub || claims.sub.length > 128 || claims.exp <= now || claims.iat > now + 60 || claims.email_verified !== true || claims.admin !== true) {
    throw new Error('Se requiere una sesión verificada con admin: true. Actualiza el token de sesión e inténtalo de nuevo.');
  }
  const profileUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/usuarios/${encodeURIComponent(claims.sub)}`;
  const profileResponse = await fetch(profileUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!profileResponse.ok) throw new Error('Firebase no confirmó un perfil activo para esta cuenta administradora.');
  const profile = await profileResponse.json();
  if (profile.fields?.activo?.booleanValue !== true) throw new Error('La cuenta administradora no tiene el perfil activo requerido.');
  return claims.sub;
}

export function pagesUrl(base, filename) {
  const normalizedBase = new URL(base);
  if (normalizedBase.protocol !== 'https:' || !normalizedBase.pathname.endsWith('/')) throw new Error('VITE_GITHUB_PAGES_URL debe ser una URL HTTPS que termine en /.');
  return new URL(`portadas/${filename}`, normalizedBase).toString();
}

function safeCoverDirectory(root) {
  return path.join(root, 'public', 'portadas');
}

async function ensureSafeCoverDirectory(root) {
  const publicDir = path.join(root, 'public');
  await mkdir(publicDir, { recursive: true });
  const publicStat = await lstat(publicDir);
  if (!publicStat.isDirectory() || publicStat.isSymbolicLink()) throw new Error('La carpeta public no es segura para guardar portadas.');
  const directory = safeCoverDirectory(root);
  await mkdir(directory, { recursive: true });
  const directoryStat = await lstat(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) throw new Error('La carpeta public/portadas no es segura.');
  const rootReal = await realpath(root);
  const directoryReal = await realpath(directory);
  if (!directoryReal.startsWith(`${rootReal}${path.sep}`)) throw new Error('La ruta de portadas queda fuera del proyecto.');
  return directory;
}

export async function saveCover(root, payload, baseUrl) {
  const type = allowedTypes.get(payload.contentType);
  if (!type || typeof payload.fileName !== 'string' || !/^[^/\\]+\.(jpe?g|png|webp)$/i.test(payload.fileName)) throw new Error('Selecciona un archivo JPG, PNG o WebP válido.');
  if (typeof payload.dataBase64 !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload.dataBase64)) throw new Error('El archivo enviado no tiene un formato válido.');
  const bytes = Buffer.from(payload.dataBase64, 'base64');
  if (!bytes.length || bytes.length > MAX_FILE_BYTES || bytes.toString('base64') !== payload.dataBase64) throw new Error('La imagen debe pesar entre 1 byte y 2 MB.');
  if (!type.signature(bytes)) throw new Error('El contenido del archivo no coincide con el formato de imagen declarado.');
  const directory = await ensureSafeCoverDirectory(root);
  const filename = `${randomUUID()}.${type.extension}`;
  const filePath = path.join(directory, filename);
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(`${path.resolve(directory)}${path.sep}`)) throw new Error('La ruta de guardado no es válida.');
  const handle = await open(filePath, 'wx', 0o644);
  try { await handle.writeFile(bytes); } finally { await handle.close(); }
  return { filename, localPath: `public/portadas/${filename}`, pagesUrl: pagesUrl(baseUrl, filename) };
}

export async function checkPublished(root, filename, baseUrl) {
  if (typeof filename !== 'string' || !/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(filename)) throw new Error('El nombre de archivo de portada no es válido.');
  const localPath = path.join(await ensureSafeCoverDirectory(root), filename);
  const fileStat = await lstat(localPath);
  if (!fileStat.isFile() || fileStat.isSymbolicLink()) throw new Error('El archivo local de portada no es un archivo válido.');
  const url = pagesUrl(baseUrl, filename);
  const response = await fetch(url, { method: 'HEAD', redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(10_000) });
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || !contentType.toLowerCase().startsWith('image/')) {
    return { published: false, status: response.status, message: 'GitHub Pages todavía no entrega la imagen. Haz push de la carpeta public/portadas, espera el despliegue y comprueba de nuevo.' };
  }
  return { published: true, pagesUrl: url, status: response.status };
}

export function localCoverStoragePlugin({ root, projectId, pagesBaseUrl }) {
  const allowedOrigins = new Set(['http://localhost:5173', 'http://127.0.0.1:5173']);
  return {
    name: 'masterfull-local-cover-storage',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
        if (pathname !== '/__local-covers/save' && pathname !== '/__local-covers/check') return next();
        if (!isLoopback(req.socket.remoteAddress) || !allowedOrigins.has(req.headers.origin) || req.headers['sec-fetch-site'] === 'cross-site') {
          return send(res, 403, { error: 'Este servicio solo acepta solicitudes de la vista previa local.' });
        }
        if (req.method !== 'POST' || !String(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 405, { error: 'Método o tipo de solicitud no permitido.' });
        if (!projectId || !pagesBaseUrl) return send(res, 503, { error: 'Falta la configuración local del proyecto Firebase o de GitHub Pages.' });
        try {
          const authHeader = String(req.headers.authorization || '');
          const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
          if (!token) return send(res, 401, { error: 'Inicia sesión con tu cuenta administradora.' });
          await verifyAdminToken(token, projectId);
          const payload = await readBody(req);
          if (pathname === '/__local-covers/save') {
            const saved = await saveCover(root, payload, pagesBaseUrl);
            return send(res, 201, { ...saved, published: false });
          }
          const result = await checkPublished(root, payload.filename, pagesBaseUrl);
          return send(res, result.published ? 200 : 409, result);
        } catch (error) {
          const status = Number(error?.status) || 400;
          return send(res, status, { error: error instanceof Error ? error.message : 'No se pudo guardar la portada.' });
        }
      });
    },
  };
}
