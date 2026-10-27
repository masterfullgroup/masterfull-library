import { useEffect, useRef, useState } from 'react';
import { Check, ExternalLink, ImageOff, Search } from 'lucide-react';
import { searchGoogleBooks, selectLargestCoverByDimensions, type GoogleBooksCandidate } from '../services/books/googleBooks.mjs';

type SearchResults = { candidates: GoogleBooksCandidate[]; usedTitleAuthorFallback: boolean };

type MeasuredCover = { url: string; source: 'Google Books' | 'Open Library'; width: number; height: number };

function useBestAvailableCover(candidate: GoogleBooksCandidate) {
  const [bestCover, setBestCover] = useState<MeasuredCover | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    let active = true;
    setBestCover(null);
    setChecking(candidate.coverOptions.length > 0);
    const checks = candidate.coverOptions.map((option) => new Promise<MeasuredCover | null>((resolve) => {
      const image = new Image();
      const timeout = window.setTimeout(() => resolve(null), 10000);
      image.onload = () => {
        window.clearTimeout(timeout);
        resolve(image.naturalWidth > 0 && image.naturalHeight > 0 ? { url: option.url, source: option.source, width: image.naturalWidth, height: image.naturalHeight } : null);
      };
      image.onerror = () => { window.clearTimeout(timeout); resolve(null); };
      image.src = option.url;
    }));
    void Promise.all(checks).then((covers) => {
      if (!active) return;
      const available = covers.filter((cover): cover is MeasuredCover => cover !== null);
      setBestCover(selectLargestCoverByDimensions(available));
      setChecking(false);
    });
    return () => { active = false; };
  }, [candidate.id, candidate.coverOptions]);
  return { bestCover, checking };
}

function CoverPreview({ candidate, cover, checking }: { candidate: GoogleBooksCandidate; cover: MeasuredCover | null; checking: boolean }) {
  return cover
    ? <img className="google-books-result-cover" src={cover.url} alt={`Portada de ${candidate.title}`} loading="lazy" decoding="async" />
    : <div className="google-books-result-cover google-books-result-cover--empty" aria-label="Sin portada disponible"><ImageOff size={18} /><span>{checking ? 'Comprobando…' : 'Sin imagen'}</span></div>;
}

function CandidateCard({ candidate, onUse }: { candidate: GoogleBooksCandidate; onUse: (url: string) => void }) {
  const { bestCover, checking } = useBestAvailableCover(candidate);
  const matchedBy = candidate.isbnMatch ? 'ISBN coincidente' : candidate.titleAuthorMatch ? 'Título y autor coinciden' : 'Verifica esta edición';
  const canUse = Boolean(bestCover) && (candidate.isbnMatch ? candidate.titleMatch && candidate.authorMatch : candidate.titleAuthorMatch);
  const isbnText = candidate.isbns.join(', ');
  return <article className="google-books-result">
    <CoverPreview candidate={candidate} cover={bestCover} checking={checking} />
    <div className="google-books-result-copy">
      <strong>{candidate.title}</strong>
      <span>{candidate.authors.join(', ') || 'Autor no indicado'}</span>
      <small>ISBN: {isbnText || 'No indicado'}</small>
      {candidate.publisher && <small>{candidate.publisher}{candidate.publishedDate ? ` · ${candidate.publishedDate}` : ''}</small>}
      <span className={`google-books-match${candidate.isbnMatch || candidate.titleAuthorMatch ? ' is-match' : ''}`}>{matchedBy}</span>
      <span className="google-books-source">Portada: {bestCover?.source ?? 'Google Books'}</span>
      {bestCover && <small className="google-books-image-dimensions">Resolución real: {bestCover.width} × {bestCover.height} px</small>}
      {bestCover && (bestCover.width < 450 || bestCover.height < 650) && <small className="google-books-low-resolution" role="status">La imagen disponible es de baja resolución; puedes reemplazarla por una URL HTTPS de mejor calidad.</small>}
      <div className="google-books-result-actions">
        <button className="button button-primary button-small" type="button" disabled={!canUse} onClick={() => bestCover && onUse(bestCover.url)}><Check size={14} />Usar esta portada</button>
        {candidate.infoLink && <a className="google-books-info-link" href={candidate.infoLink} target="_blank" rel="noreferrer">Ficha<ExternalLink size={12} /></a>}
      </div>
      {!canUse && <small className="google-books-unverified">{checking ? 'Comprobando qué tamaños están disponibles…' : 'No se puede seleccionar sin imagen válida y coincidencia suficiente.'}</small>}
    </div>
  </article>;
}

export default function GoogleBooksCoverPicker({ isbn, title, author, selectedCover, onUseCover }: {
  isbn: string;
  title: string;
  author: string;
  selectedCover: string;
  onUseCover: (url: string) => void;
}) {
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function search() {
    controller.current?.abort();
    const nextController = new AbortController();
    controller.current = nextController;
    setSearching(true); setError(''); setNotice('');
    try {
      const result = await searchGoogleBooks({ isbn, title, author, apiKey: import.meta.env.VITE_GOOGLE_BOOKS_API_KEY ?? '', signal: nextController.signal });
      setResults(result);
      setNotice(result.usedTitleAuthorFallback ? 'No encontramos una portada con ISBN exacto; también buscamos por título y autor. Revisa la edición antes de elegir.' : 'Revisa título, autor e ISBN. La portada solo se guardará cuando elijas “Usar esta portada”.');
      if (!result.candidates.length) setNotice('Google Books no encontró coincidencias para esta búsqueda. Comprueba los datos e inténtalo de nuevo.');
    } catch (reason) {
      if (nextController.signal.aborted) return;
      setResults(null);
      setError(reason instanceof Error ? reason.message : 'No se pudo consultar Google Books. Revisa tu conexión.');
    } finally {
      if (!nextController.signal.aborted) setSearching(false);
    }
  }

  return <div className="google-books-picker">
    <div className="google-books-picker-heading">
      <div><strong>Buscar portada en Google Books</strong><small>La búsqueda usa ISBN; si no hay coincidencia con portada, consulta también título y autor.</small></div>
      <button className="button button-secondary button-small" type="button" onClick={() => void search()} disabled={searching}><Search size={14} />{searching ? 'Buscando…' : results ? 'Buscar nuevamente' : 'Buscar portada'}</button>
    </div>
    {searching && <p className="google-books-state" role="status">Consultando Google Books…</p>}
    {error && <p className="google-books-error" role="alert">{error}</p>}
    {notice && !searching && <p className="google-books-state" role="status">{notice}</p>}
    {selectedCover && <div className="google-books-selected"><Check size={14} /><span>Portada seleccionada. Se conservará si buscas de nuevo; cambia solo al confirmar otra coincidencia.</span></div>}
    {results && results.candidates.length > 0 && <div className="google-books-results" aria-label="Coincidencias de Google Books">{results.candidates.map((candidate) => <CandidateCard key={candidate.id} candidate={candidate} onUse={onUseCover} />)}</div>}
    {results && !results.candidates.length && <p className="google-books-state">No hay imágenes que se puedan elegir. No se generó una portada automática.</p>}
  </div>;
}
