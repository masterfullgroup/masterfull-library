import { useEffect, useRef, useState } from 'react';
import { Check, CircleAlert, ImagePlus, LoaderCircle, RefreshCw, Upload } from 'lucide-react';
import { useLibrary } from '../context/LibraryContext';
import { firebaseAuth } from '../firebase/client';
import type { Book } from '../models/book';
import { matchCoverFiles } from '../services/books/bulkCoverMatching.mjs';
import { prepareCover } from '../services/books/prepareCover';
import { validateCoverUploadFile } from '../services/books/coverUpload.mjs';

type Match = { status: 'matched' | 'ambiguous' | 'unmatched'; book: Book | null; reason?: string };
type Item = { key: string; file: File; preview: string; width: number; height: number; match: Match; state: 'selected' | 'saving' | 'prepared' | 'publishing' | 'published' | 'verification-failed' | 'failed'; filename?: string; localPath?: string; pagesUrl?: string; error?: string; optimized?: boolean };

function asDataBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { const result = String(reader.result ?? ''); const comma = result.indexOf(','); if (comma < 0) reject(new Error('No se pudo leer la imagen.')); else resolve(result.slice(comma + 1)); };
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.readAsDataURL(blob);
  });
}

async function requestLocal(path: string, payload: unknown) {
  const user = firebaseAuth?.currentUser;
  if (!user) throw new Error('Inicia sesión con la cuenta administradora antes de continuar.');
  const token = await user.getIdToken(true);
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || result.message || 'El servidor local no pudo completar la operación.');
  return result;
}

export default function BulkCoverManager() {
  const { books, updateConfirmedBookCovers } = useLibrary();
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [replaceConfirmed, setReplaceConfirmed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrls = useRef(new Set<string>());
  const localDevAvailable = import.meta.env.DEV && ['localhost', '127.0.0.1'].includes(window.location.hostname) && window.location.port === '5173';
  useEffect(() => () => objectUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  async function selectFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(''); setMessage('');
    if (files.length > 100) { setError('Selecciona un máximo de 100 imágenes por lote.'); return; }
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current.clear();
    const matches = matchCoverFiles(Array.from(files), books);
    const next: Item[] = [];
    for (const [index, file] of Array.from(files).entries()) {
      const validation = validateCoverUploadFile(file);
      if (!validation.valid) { next.push({ key: crypto.randomUUID(), file, preview: '', width: 0, height: 0, match: matches[index], state: 'failed', error: validation.reason }); continue; }
      const preview = URL.createObjectURL(file); objectUrls.current.add(preview);
      try {
        const image = new Image();
        const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => { image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight }); image.onerror = () => reject(new Error('El archivo está dañado o no contiene una imagen válida.')); image.src = preview; });
        if (dimensions.width * dimensions.height > 40_000_000) throw new Error('La imagen supera 40 megapíxeles.');
        next.push({ key: crypto.randomUUID(), file, preview, ...dimensions, match: matches[index], state: 'selected' });
      } catch (reason) {
        next.push({ key: crypto.randomUUID(), file, preview, width: 0, height: 0, match: matches[index], state: 'failed', error: reason instanceof Error ? reason.message : 'No se pudo leer la imagen.' });
      }
    }
    setItems(next); setSelected({}); setReplaceConfirmed({});
  }

  async function saveLocalBatch(retryOnly = false) {
    const queue = items.filter((item) => retryOnly ? item.state === 'failed' : item.state === 'selected');
    if (!queue.length) return;
    setBusy(true); setError(''); setMessage('');
    for (const item of queue) {
      setItems((current) => current.map((entry) => entry.key === item.key ? { ...entry, state: 'saving', error: undefined } : entry));
      try {
        const prepared = await prepareCover(item.file, item.file.name);
        const dataBase64 = await asDataBase64(prepared.blob);
        const result = await requestLocal('/__local-covers/batch-save', { fileName: prepared.fileName, contentType: prepared.contentType, dataBase64 });
        setItems((current) => current.map((entry) => entry.key === item.key ? { ...entry, state: 'prepared', filename: result.filename, localPath: result.localPath, pagesUrl: result.pagesUrl, optimized: prepared.optimized } : entry));
      } catch (reason) {
        setItems((current) => current.map((entry) => entry.key === item.key ? { ...entry, state: 'failed', error: reason instanceof Error ? reason.message : 'No se pudo preparar la portada.' } : entry));
      }
    }
    setBusy(false);
  }

  async function publishBatch() {
    const queue = items.filter((item) => (item.state === 'prepared' || item.state === 'failed') && item.filename);
    if (!queue.length) return;
    if (!window.confirm(`Se publicarán ${queue.length} portadas mediante un único commit y push de Git a main. Solo se incluirán esos archivos de public/portadas. ¿Confirmas?`)) return;
    setBusy(true); setError(''); setMessage('');
    setItems((current) => current.map((item) => queue.some((entry) => entry.key === item.key) ? { ...item, state: 'publishing' } : item));
    try {
      await requestLocal('/__local-covers/publish-batch', { filenames: queue.map((item) => item.filename) });
      for (const item of queue) {
        try {
          const result = await requestLocal('/__local-covers/check', { filename: item.filename });
          if (result.published !== true || result.sha256 !== item.filename?.split('.')[0]) throw new Error(result.message || 'La imagen publicada no coincide con la copia local.');
          setItems((current) => current.map((entry) => entry.key === item.key ? { ...entry, state: 'published', pagesUrl: result.pagesUrl, error: undefined } : entry));
        } catch (reason) {
          setItems((current) => current.map((entry) => entry.key === item.key ? { ...entry, state: 'verification-failed', error: reason instanceof Error ? reason.message : 'Falló la verificación en Pages.' } : entry));
        }
      }
      setMessage('Proceso Git completado. Cada URL se comparó byte por byte con la imagen local antes de ofrecer su asignación.');
    } catch (reason) {
      setItems((current) => current.map((entry) => queue.some((queued) => queued.key === entry.key) ? { ...entry, state: 'failed', error: reason instanceof Error ? reason.message : 'No se pudo publicar el lote.' } : entry));
      setError(reason instanceof Error ? reason.message : 'No se pudo publicar el lote.');
    } finally { setBusy(false); }
  }

  async function verifyFailed() {
    const queue = items.filter((item) => (item.state === 'failed' || item.state === 'verification-failed') && item.filename);
    if (!queue.length) return;
    setBusy(true); setError('');
    for (const item of queue) {
      try {
        const result = await requestLocal('/__local-covers/check', { filename: item.filename });
        if (result.published !== true || result.sha256 !== item.filename?.split('.')[0]) throw new Error(result.message || 'La portada aún no está confirmada en Pages.');
        setItems((current) => current.map((entry) => entry.key === item.key ? { ...entry, state: 'published', pagesUrl: result.pagesUrl, error: undefined } : entry));
      } catch (reason) { setItems((current) => current.map((entry) => entry.key === item.key ? { ...entry, error: reason instanceof Error ? reason.message : 'Todavía no se pudo verificar.' } : entry)); }
    }
    setBusy(false);
  }

  async function applyConfirmed() {
    const queue = items.filter((item) => item.state === 'published' && item.match.status === 'matched' && item.match.book && selected[item.key] && (!item.match.book.sourceCoverUrl || replaceConfirmed[item.key]));
    if (!queue.length) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await updateConfirmedBookCovers(queue.map((item) => ({ id: item.match.book!.id, coverUrl: item.pagesUrl!, expectedCoverUrl: item.match.book!.sourceCoverUrl ?? '', replaceExisting: Boolean(replaceConfirmed[item.key]) })));
      const keys = new Set(queue.map((item) => item.key));
      setItems((current) => current.map((item) => keys.has(item.key) ? { ...item, state: 'published' } : item));
      setSelected((current) => { const next = { ...current }; keys.forEach((key) => delete next[key]); return next; });
      setMessage(`${queue.length} portada(s) confirmada(s) y guardada(s) en los libros seleccionados.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Firestore no pudo guardar las asignaciones confirmadas.'); }
    finally { setBusy(false); }
  }

  const pendingCount = items.filter((item) => item.state === 'selected' || item.state === 'prepared' || item.state === 'saving' || item.state === 'publishing').length;
  const publishedCount = items.filter((item) => item.state === 'published').length;
  const failedCount = items.filter((item) => item.state === 'failed' || item.state === 'verification-failed').length;
  const unmatchedCount = items.filter((item) => item.match.status === 'unmatched').length;
  const ambiguousCount = items.filter((item) => item.match.status === 'ambiguous').length;
  const assignable = items.some((item) => item.state === 'published' && item.match.status === 'matched' && item.match.book && selected[item.key] && (!item.match.book.coverUrl || replaceConfirmed[item.key]));

  return <section className="admin-panel bulk-covers-manager">
    <div className="admin-panel-heading"><div><span className="panel-overline">PORTADAS DE LA COLECCIÓN</span><h2>Administrar portadas</h2></div><span className="panel-count">Hasta 100 imágenes</span></div>
    <p className="admin-empty-copy">Elige archivos JPG, PNG o WebP. Se preparan localmente y se publican juntas cuando confirmas. La selección requiere una coincidencia inequívoca por ISBN o ID exacto del libro.</p>
    {!localDevAvailable ? <div className="cover-upload-storage-note"><strong>La publicación requiere el servidor local.</strong> Abre Masterfull Library en tu computadora con el servidor de desarrollo. GitHub Pages solo sirve la plataforma: no recibe archivos ni ejecuta Git.</div> : <>
    <div className="bulk-cover-toolbar"><label className="button button-secondary button-small" htmlFor="bulk-cover-files"><ImagePlus size={15} />Seleccionar imágenes</label><input ref={inputRef} id="bulk-cover-files" className="sr-only" type="file" multiple accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(event) => { void selectFiles(event.currentTarget.files); event.currentTarget.value = ''; }} /><span>{items.length} seleccionadas</span><span>Publicadas: {publishedCount}</span><span>Pendientes: {pendingCount}</span><span>Fallidas: {failedCount}</span><span>Sin coincidencia: {unmatchedCount}</span><span>Ambiguas: {ambiguousCount}</span></div>
    {items.length > 0 && <div className="bulk-cover-actions">
      <button className="button button-primary button-small" disabled={busy || !items.some((item) => item.state === 'selected')} onClick={() => void saveLocalBatch()}><Upload size={14} />{busy ? 'Procesando…' : 'Preparar lote'}</button>
      <button className="button button-secondary button-small" disabled={busy || !items.some((item) => (item.state === 'prepared' || item.state === 'failed') && item.filename)} onClick={() => void publishBatch()}><Check size={14} />Publicar o reintentar publicación</button>
      <button className="button button-secondary button-small" disabled={busy || !failedCount} onClick={() => void saveLocalBatch(true)}><RefreshCw size={14} />Reintentar preparación</button>
      <button className="button button-secondary button-small" disabled={busy || !items.some((item) => (item.state === 'failed' || item.state === 'verification-failed') && item.filename)} onClick={() => void verifyFailed()}><RefreshCw size={14} />Reintentar verificación</button>
      <button className="button button-secondary button-small" disabled={busy || !assignable} onClick={() => void applyConfirmed()}><Check size={14} />Guardar asignaciones confirmadas</button>
    </div>}
    {message && <p className="cover-upload-good" role="status">{message}</p>}{error && <p className="cover-upload-error" role="alert">{error}</p>}
    {items.length > 0 && <div className="bulk-cover-grid">{items.map((item) => <article className="bulk-cover-item" key={item.key}>
      {item.preview ? <img src={item.preview} alt={`Vista previa de ${item.file.name}`} /> : <span className="bulk-cover-broken"><CircleAlert size={20} /></span>}
      <div className="bulk-cover-info"><strong title={item.file.name}>{item.file.name}</strong><small>{item.width ? `${item.width} × ${item.height} px` : `${(item.file.size / 1024).toFixed(0)} KB`}{item.optimized ? ' · optimizada' : ''}</small><span className={`bulk-cover-status bulk-cover-status--${item.state}`}>{item.state === 'published' ? 'Publicada y verificada' : item.state === 'prepared' ? 'Lista para publicar' : item.state === 'saving' || item.state === 'publishing' ? <><LoaderCircle size={12} />En proceso</> : item.state === 'verification-failed' ? 'Pendiente de verificación' : item.state === 'failed' ? 'Fallida' : 'Pendiente'}</span>
      {item.match.status === 'matched' && item.match.book ? <><span className="bulk-cover-match">Coincidencia: {item.match.book.title}</span>{item.state === 'published' && <label className="bulk-cover-confirm"><input type="checkbox" checked={Boolean(selected[item.key])} onChange={(event) => setSelected((current) => ({ ...current, [item.key]: event.target.checked }))} />Confirmo asignar a este libro</label>}{item.state === 'published' && item.match.book.sourceCoverUrl && <label className="bulk-cover-confirm"><input type="checkbox" checked={Boolean(replaceConfirmed[item.key])} onChange={(event) => setReplaceConfirmed((current) => ({ ...current, [item.key]: event.target.checked }))} />Confirmo reemplazar su portada actual</label>}</> : <span className="bulk-cover-match">{item.match.status === 'ambiguous' ? 'Coincidencia ambigua: no se asignará.' : 'Sin coincidencia exacta por ISBN o ID.'}</span>}
      {item.error && <span className="cover-upload-error">{item.error}</span>}{item.pagesUrl && <a href={item.pagesUrl} target="_blank" rel="noreferrer">Abrir imagen publicada</a>}</div>
    </article>)}</div>}
    </>}
  </section>;
}
