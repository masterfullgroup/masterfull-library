import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { useLibrary } from '../context/LibraryContext';
import { fileProvider } from '../services/files/FileProvider';

export default function ReaderPage() {
  const { id = '' } = useParams();
  const { books, loading, recordViewed } = useLibrary();
  const navigate = useNavigate();
  const book = books.find((item) => item.id === id);
  const [previewUrl, setPreviewUrl] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!book) return;
    void recordViewed(book.id);
    let cancelled = false;
    void fileProvider.resolve(book).then((result) => {
      if (cancelled) return;
      if (result.status === 'ready') setPreviewUrl(result.previewUrl);
      else setMessage(result.message);
    });
    return () => { cancelled = true; };
  }, [book?.id]);

  if (!book && loading) return <main className="reader-screen"><div className="reader-loading"><strong>Cargando libro…</strong></div></main>;
  if (!book) return <main className="reader-screen"><header className="reader-topbar"><button className="reader-back" onClick={() => navigate('/catalog')}><ArrowLeft size={17} />Volver al catálogo</button></header><div className="reader-loading"><strong>No encontramos ese libro.</strong></div></main>;

  return <main className="reader-screen">
    <header className="reader-topbar">
      <button className="reader-back" onClick={() => navigate(`/book/${book.id}`)}><ArrowLeft size={17} /><span>Volver a la ficha</span></button>
      <div className="reader-book-title"><span>LECTOR PDF</span><strong>{book.title}</strong></div>
    </header>
    <section className="reader-drive-viewer" aria-label={`Lector de ${book.title}`}>
      {previewUrl ? <iframe title={`Documento PDF: ${book.title}`} src={previewUrl} allow="autoplay; fullscreen" allowFullScreen /> : <div className="reader-loading"><span className="reader-load-icon"><BookOpen size={22} /></span><strong>No se puede abrir este documento.</strong><span>{message || 'No hay un enlace de Google Drive válido para este libro.'}</span></div>}
    </section>
    {previewUrl && <p className="reader-drive-note">Si el propietario habilitó el acceso con enlace, el documento aparecerá aquí. Google Drive controla la visualización y los permisos del archivo.</p>}
  </main>;
}
