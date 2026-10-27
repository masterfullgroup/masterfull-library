import { useEffect, useState } from 'react';
import { Check, Clipboard, ImagePlus, LoaderCircle, Trash2, Upload } from 'lucide-react';
import { assessCoverDimensions, validateCoverUploadFile } from '../services/books/coverUpload.mjs';
import { prepareCover } from '../services/books/prepareCover';
import { firebaseAuth } from '../firebase/client';

type SavedCover = { filename: string; localPath: string; pagesUrl: string };

export default function LocalCoverPicker({ onPendingChange, onUseCover }: { onPendingChange: (pending: boolean) => void; onUseCover: (url: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [qualityConfirmed, setQualityConfirmed] = useState(false);
  const [savedCover, setSavedCover] = useState<SavedCover | null>(null);
  const [savingLocal, setSavingLocal] = useState(false);
  const [checkingPublish, setCheckingPublish] = useState(false);
  const [published, setPublished] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      setDimensions(null);
      return;
    }
    let active = true;
    const objectUrl = URL.createObjectURL(file);
    const probe = new Image();
    setPreviewUrl(objectUrl);
    setDimensions(null);
    probe.onload = () => {
      if (active && probe.naturalWidth * probe.naturalHeight > 40_000_000) {
        setError('La imagen supera 40 megapíxeles y no se puede procesar de forma segura. Elige una imagen menor.');
        setFile(null);
        onPendingChange(false);
      } else if (active) setDimensions({ width: probe.naturalWidth, height: probe.naturalHeight });
    };
    probe.onerror = () => {
      if (!active) return;
      setError('El archivo está dañado o no contiene una imagen compatible.');
      setFile(null);
      onPendingChange(false);
    };
    probe.src = objectUrl;
    return () => {
      active = false;
      URL.revokeObjectURL(objectUrl);
    };
  }, [file, onPendingChange]);

  function selectFile(nextFile?: File) {
    if (!nextFile) return;
    const validation = validateCoverUploadFile(nextFile);
    setQualityConfirmed(false);
    setSavedCover(null);
    setPublished(false);
    setNotice('');
    if (!validation.valid) {
      setFile(null);
      setError(validation.reason);
      onPendingChange(false);
      return;
    }
    setError('');
    setSavedCover(null);
    setPublished(false);
    setNotice('');
    setFile(nextFile);
    onPendingChange(true);
  }

  function removeFile() {
    setFile(null);
    setDimensions(null);
    setError('');
    setQualityConfirmed(false);
    setSavedCover(null);
    setPublished(false);
    setNotice('');
    onPendingChange(false);
  }

  async function saveToProject() {
    if (!file || !quality || (quality.requiresConfirmation && !qualityConfirmed)) return;
    setSavingLocal(true);
    setError('');
    setNotice('');
    try {
      const currentUser = firebaseAuth?.currentUser;
      if (!currentUser) throw new Error('Inicia sesión con la cuenta administradora antes de guardar portadas.');
      const token = await currentUser.getIdToken(true);
      const prepared = await prepareCover(file);
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || '');
          const comma = result.indexOf(',');
          if (comma < 0) reject(new Error('No se pudo leer el archivo seleccionado.'));
          else resolve(result.slice(comma + 1));
        };
        reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
        reader.readAsDataURL(prepared.blob);
      });
      const response = await fetch('/__local-covers/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fileName: prepared.fileName, contentType: prepared.contentType, dataBase64 }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar la portada en el proyecto.');
      setSavedCover({ filename: result.filename, localPath: result.localPath, pagesUrl: result.pagesUrl });
      setNotice(prepared.optimized ? 'Portada optimizada a WebP, sin recortar y conservando su proporción. Está guardada localmente; publícala con Git y comprueba GitHub Pages antes de guardar el libro.' : 'Portada guardada en el proyecto local. Publícala con Git y comprueba que GitHub Pages la entregue antes de guardar el libro.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar la portada localmente.');
    } finally {
      setSavingLocal(false);
    }
  }

  async function confirmPublished() {
    if (!savedCover) return;
    setCheckingPublish(true);
    setError('');
    setNotice('Comprobando la URL pública en GitHub Pages…');
    try {
      const currentUser = firebaseAuth?.currentUser;
      if (!currentUser) throw new Error('Inicia sesión con la cuenta administradora para comprobar la publicación.');
      const token = await currentUser.getIdToken(true);
      const response = await fetch('/__local-covers/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ filename: savedCover.filename }),
      });
      const result = await response.json();
      if (!response.ok || result.published !== true) throw new Error(result.message || result.error || 'GitHub Pages todavía no entrega esta portada.');
      setPublished(true);
      onUseCover(result.pagesUrl);
      onPendingChange(false);
      setNotice('GitHub Pages confirmó la imagen. Espera a que la vista previa la valide; después puedes guardar el libro.');
    } catch (reason) {
      setNotice('La portada local se conserva. El libro no cambiará hasta que la publicación se pueda verificar.');
      setError(reason instanceof Error ? reason.message : 'No se pudo confirmar la publicación.');
    } finally {
      setCheckingPublish(false);
    }
  }

  async function copyGitCommands() {
    if (!savedCover) return;
    const commands = `git add -- "${savedCover.localPath}"\ngit commit --only -m "Agregar portada de libro" -- "${savedCover.localPath}"\ngit push`;
    try {
      await navigator.clipboard.writeText(commands);
      setNotice('Comandos Git copiados. Ejecútalos en PowerShell desde la raíz del proyecto y espera el despliegue de Pages.');
    } catch {
      setNotice(commands);
    }
  }

  const quality = dimensions ? assessCoverDimensions(dimensions.width, dimensions.height) : null;
  const fileSize = file ? `${(file.size / 1024).toFixed(0)} KB` : '';

  return <div className="local-cover-picker">
    {!file ? <label className={`cover-dropzone${dragging ? ' is-dragging' : ''}`} htmlFor="local-cover-file" onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); selectFile(event.dataTransfer.files?.[0]); }}>
      <Upload size={20} aria-hidden="true" />
      <strong>Arrastra una imagen aquí</strong>
      <span>JPG, PNG o WebP · máximo 10 MB de origen</span>
      <span className="button button-secondary button-small">Seleccionar imagen</span>
      <input id="local-cover-file" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(event) => { selectFile(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
    </label> : <div className="local-cover-selection">
      {previewUrl && <div className="local-cover-preview-frame"><img src={previewUrl} alt="Vista previa de la portada local" /></div>}
      <div className="local-cover-file-info">
        <span className="local-cover-file-icon"><ImagePlus size={18} /></span>
        <strong>{file.name}</strong>
        <span>{fileSize}{dimensions ? ` · ${dimensions.width} × ${dimensions.height} px` : ' · Comprobando dimensiones…'}</span>
        {quality?.lowResolution && <span className="cover-upload-warning" role="status">Resolución baja. Se recomienda al menos 400 × 600 px; ampliarla puede reducir la nitidez.</span>}
        {quality && !quality.isPortrait && <span className="cover-upload-warning" role="status">La imagen no es vertical. Se mantendrá su proporción y no se recortará ni convertirá.</span>}
        {quality?.requiresConfirmation && <><span className={qualityConfirmed ? 'cover-upload-good' : 'cover-upload-warning'} role="status">{qualityConfirmed ? 'Calidad y proporción confirmadas para esta vista previa.' : 'Confirma la calidad y proporción para dejar la selección lista.'}</span><label className="cover-quality-confirm"><input type="checkbox" checked={qualityConfirmed} onChange={(event) => setQualityConfirmed(event.target.checked)} />Confirmo que quiero usar esta imagen con su calidad y proporción actuales.</label></>}
        {quality?.valid && !quality.requiresConfirmation && <span className="cover-upload-good">Imagen válida para la vista previa.</span>}
        <small>La imagen se guardará en public/portadas. La vista previa del navegador es temporal hasta que GitHub Pages publique el archivo.</small>
        <button className="button button-secondary button-small cover-remove-selection" type="button" onClick={removeFile}><Trash2 size={14} />Quitar selección</button>
      </div>
    </div>}
    {error && <p className="cover-upload-error" role="alert">{error}</p>}
    {notice && <p className="cover-upload-good" role="status">{notice}</p>}
    {file && !savedCover && <button className="button button-primary button-small" type="button" onClick={() => void saveToProject()} disabled={savingLocal || !dimensions || Boolean(quality?.requiresConfirmation && !qualityConfirmed)}>{savingLocal ? <><LoaderCircle size={14} />Guardando en el proyecto…</> : <><Upload size={14} />Guardar localmente</>}</button>}
    {savedCover && <div className="cover-publish-panel">
      <div><strong>{published ? 'Portada publicada' : 'Pendiente de publicar'}</strong><small>{savedCover.localPath}</small><code>{savedCover.pagesUrl}</code></div>
      {!published && <><button className="button button-secondary button-small" type="button" onClick={() => void copyGitCommands()}><Clipboard size={14} />Copiar comandos Git</button>
      <button className="button button-primary button-small" type="button" onClick={() => void confirmPublished()} disabled={checkingPublish}>{checkingPublish ? <><LoaderCircle size={14} />Comprobando…</> : <><Check size={14} />Comprobar publicación</>}</button></>}
    </div>}
    <p className="cover-upload-storage-note">La imagen se guarda en el repositorio. Firestore recibe la URL solo después de confirmar que GitHub Pages sirve el archivo. Publica únicamente portadas que puedan ser de acceso público.</p>
  </div>;
}
