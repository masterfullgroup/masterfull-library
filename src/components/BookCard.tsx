import { ArrowUpRight, Bookmark, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Book } from '../models/book';
import { useLibrary } from '../context/LibraryContext';
import { useToast } from '../context/ToastContext';
import BookCover from './BookCover';

export default function BookCard({ book, index = 0 }: { book: Book; index?: number }) {
  const { favorites, toggleFavorite } = useLibrary();
  const toast = useToast();
  const saved = favorites.includes(book.id);
  return (
    <article className="book-card" style={{ animationDelay: `${Math.min(index, 7) * 35}ms` }}>
      <div className="book-card-cover-wrap">
        <Link to={`/book/${book.id}`} className="book-card-cover-link" aria-label={`Ver ${book.title}`}><BookCover book={book} /></Link>
        <button className={`icon-button cover-save${saved ? ' is-saved' : ''}`} aria-label={saved ? `Quitar ${book.title} de favoritos` : `Guardar ${book.title} en favoritos`} aria-pressed={saved} onClick={() => { toggleFavorite(book.id); toast(saved ? 'Se quitó de favoritos.' : 'Se guardó en favoritos.', 'success'); }}><Heart size={17} fill={saved ? 'currentColor' : 'none'} /></button>
        <span className="cover-format">{book.format}</span>
      </div>
      <div className="book-card-body">
        <div className="book-card-category"><span className="category-pin" />{book.category || 'Sin categoría'}{book.demo && <span className="book-demo-tag">DEMO</span>}</div>
        <Link className="book-card-title" to={`/book/${book.id}`}>{book.title}</Link>
        <p className="book-card-author">{book.authors.join(', ')}</p>
        <div className="book-card-foot"><span>{book.year ?? 'Año no disponible'}</span><Link to={`/reader/${book.id}`} className="button button-secondary button-small book-read-button">Leer libro</Link></div>
      </div>
    </article>
  );
}

export function CompactBookRow({ book }: { book: Book }) {
  return <Link to={`/book/${book.id}`} className="compact-book-row"><span className={`mini-cover mini-cover--${book.cover}`}><Bookmark size={16} /></span><span className="compact-book-copy"><strong>{book.title}</strong><small>{book.authors[0]} · {book.category}</small></span><ArrowUpRight size={15} className="muted-icon" /></Link>;
}
