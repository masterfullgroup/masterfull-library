import { BookOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Book } from '../models/book';
import { resolveCoverImageUrl } from '../services/books/coverImage.mjs';

export default function BookCover({ book, large = false }: { book: Book; large?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = resolveCoverImageUrl(book.coverUrl, book.driveUrl ?? book.fileReference ?? '');
  useEffect(() => setImageFailed(false), [imageUrl]);
  const showImage = Boolean(imageUrl) && !imageFailed;
  return (
    <div className={`book-cover cover-${book.cover}${large ? ' book-cover--large' : ''}${showImage ? ' has-cover-image' : ' is-placeholder'}`} aria-label={showImage ? `Portada de ${book.title}` : `Portada no disponible: ${book.title}`}>
      {showImage ? <img className="book-cover-image" src={imageUrl} alt={`Portada de ${book.title}`} loading="lazy" decoding="async" onError={() => setImageFailed(true)} /> : <div className="book-cover-placeholder"><span className="cover-topline"><span>MASTERFULL LIBRARY</span><span>{book.format}</span></span><BookOpen className="cover-placeholder-icon" strokeWidth={1.2} aria-hidden="true" /><span className="cover-copy"><span className="cover-kicker">{book.demo ? 'LIBRO DE DEMOSTRACIÓN' : book.category || 'BIBLIOTECA DIGITAL'}</span><strong>{book.title}</strong>{book.subtitle && <span>{book.subtitle}</span>}</span><span className="cover-footer">{book.authors[0] || 'Autor no disponible'}</span></div>}
      {book.demo && <span className="book-demo-tag book-cover-demo">DEMO</span>}
    </div>
  );
}
