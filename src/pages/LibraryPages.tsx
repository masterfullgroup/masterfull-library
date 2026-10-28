import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowDownAZ, ArrowLeft, ArrowRight, ArrowUpRight, Atom, BookOpen, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, Cloud, Ellipsis, FileText, FlaskConical, FolderKanban, FunctionSquare, Grid2X2, Heart, History, Leaf, List, LockKeyhole, Pencil, Plus, Search, ShieldCheck, SlidersHorizontal, Sparkles, Check, Trash2, X, RefreshCw, type LucideIcon } from 'lucide-react';
import { useLibrary } from '../context/LibraryContext';
import { useToast } from '../context/ToastContext';
import type { Book, LibraryCategory } from '../models/book';
import BookCard from '../components/BookCard';
import BookCover from '../components/BookCover';
import GoogleBooksCoverPicker from '../components/GoogleBooksCoverPicker';
import LocalCoverPicker from '../components/LocalCoverPicker';
import { normalizeDriveFile } from '../services/files/googleDrive.mjs';
import { resolveCoverImageUrl } from '../services/books/coverImage.mjs';
import { useAuth } from '../context/AuthContext';
import { firebaseConfigured } from '../firebase/client';
import { fetchAccessRequests, manageAccessRequest, type AccessRequest } from '../services/accessRequests';

const iconMap = { atom: Atom, function: FunctionSquare, flask: FlaskConical, cpu: SlidersHorizontal, briefcase: BookOpen, book: FileText, leaf: Leaf, globe: Sparkles };

function SectionTitle({ index, eyebrow, title, link, onClick }: { index?: string; eyebrow: string; title: string; link?: string; onClick?: () => void }) {
  return <div className="section-heading"><div className="section-heading-main"><div className="section-overline">{index && <><span>{index}</span><i /></>}{eyebrow}</div><h2>{title}</h2></div>{link && <button className="text-link" onClick={onClick}>{link}<ArrowRight size={15} /></button>}</div>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><span className="eyebrow"><i />{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function EmptyState({ icon: Icon = Search, title, description, action, onAction }: { icon?: LucideIcon; title: string; description: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={23} /></span><h3>{title}</h3><p>{description}</p>{action && <button className="button button-secondary" onClick={onAction}>{action}<ArrowRight size={15} /></button>}</div>;
}

export function HomePage() {
  const { books, categories, recentBooks, loading, error } = useLibrary();
  const navigate = useNavigate();
  const activeBooks = useMemo(() => books.filter((book) => book.active !== false), [books]);
  const recentlyAdded = useMemo(() => {
    const seen = new Set<string>();
    return [...activeBooks].filter((book) => Boolean(book.addedAt))
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
      .filter((book) => {
        if (seen.has(book.id)) return false;
        seen.add(book.id);
        return true;
      }).slice(0, 6);
  }, [activeBooks]);
  const recentHistory = useMemo(() => {
    const seen = new Set<string>();
    return recentBooks.flatMap(({ id }) => {
      if (seen.has(id)) return [];
      seen.add(id);
      const book = activeBooks.find((entry) => entry.id === id);
      return book ? [book] : [];
    });
  }, [activeBooks, recentBooks]);
  const resume = recentHistory.slice(0, 3);
  const activeCategories = categories.filter((category) => category.active);
  const mainCategories = activeCategories.filter((category) => !category.parentId);
  return <div className="page home-page">
    <PageHeading eyebrow="BIBLIOTECA PERSONAL" title="Explora el conocimiento." description="Tu biblioteca digital para aprender, investigar y descubrir." />
    {error && <div className="admin-warning" role="alert"><LockKeyhole size={16} /><span>{error}</span></div>}
    <section className="home-section continue-section" id="continue-reading">
      <SectionTitle eyebrow="TU HISTORIAL" title="Continuar leyendo" link={recentHistory.length > 3 ? 'Ver historial' : undefined} onClick={() => navigate('/history')} />
      {loading ? <div className="reader-loading"><strong>Cargando historial…</strong></div> : resume.length ? <div className="continue-reading-grid">{resume.map((book) => <ContinueReadingCard key={book.id} book={book} />)}</div> : <EmptyState icon={History} title="Aún no hay lecturas recientes." description="Cuando abras un libro, podrás retomarlo desde aquí." action="Explorar catálogo" onAction={() => navigate('/catalog')} />}
    </section>
    <section className="home-section category-section"><SectionTitle eyebrow="BIBLIOTECA" title="Explorar disciplinas" link="Ver categorías" onClick={() => navigate('/categories')} />{loading ? <div className="reader-loading"><strong>Cargando categorías…</strong></div> : mainCategories.length ? <div className="home-category-grid">{mainCategories.slice(0, 8).map((category, index) => <CategoryTile key={category.id} category={category} count={booksInCategory(category, activeBooks, categories, true)} index={index} onClick={() => navigate(`/catalog?category=${encodeURIComponent(category.name)}`)} />)}</div> : <EmptyState icon={FolderKanban} title="Aún no hay categorías." description="Las categorías aparecerán aquí cuando se registren en la biblioteca." />}</section>
    <section className="home-section"><SectionTitle eyebrow="COLECCIÓN" title="Añadidos recientemente" link="Ver catálogo" onClick={() => navigate('/catalog?sort=newest')} />{loading ? <div className="reader-loading"><strong>Cargando libros…</strong></div> : recentlyAdded.length ? <div className="home-added-grid">{recentlyAdded.map((book) => <HomeAddedBookCard key={book.id} book={book} />)}</div> : <EmptyState icon={BookOpen} title="Tu biblioteca está lista para empezar." description="Los libros incorporados a tu colección aparecerán en esta sección." action="Explorar catálogo" onAction={() => navigate('/catalog')} />}</section>
  </div>;
}

function ContinueReadingCard({ book }: { book: Book }) {
  return <article className="continue-reading-card">
    <Link to={`/book/${book.id}`} className="continue-reading-cover" aria-label={`Ver detalles de ${book.title}`}><BookCover book={book} /></Link>
    <div className="continue-reading-copy">
      <span className="continue-reading-category" title={book.category || 'Sin categoría'}>{book.category || 'Sin categoría'}</span>
      <Link className="continue-reading-title" to={`/book/${book.id}`} title={book.title}>{book.title}</Link>
      <span className="continue-reading-author" title={book.authors.join(', ')}>{book.authors.join(', ') || 'Autor no disponible'}</span>
      {book.year && <span className="continue-reading-year">{book.year}</span>}
      <Link className="button button-primary button-small continue-reading-action" to={`/reader/${book.id}`}>Volver a leer<ArrowRight size={14} /></Link>
    </div>
  </article>;
}

function HomeAddedBookCard({ book }: { book: Book }) {
  const { favorites, toggleFavorite } = useLibrary();
  const toast = useToast();
  const saved = favorites.includes(book.id);
  return <article className="home-added-card">
    <div className="home-added-cover-wrap">
      <Link to={`/book/${book.id}`} aria-label={`Ver detalles de ${book.title}`}><BookCover book={book} /></Link>
      <button className={`icon-button cover-save${saved ? ' is-saved' : ''}`} aria-label={saved ? `Quitar ${book.title} de favoritos` : `Guardar ${book.title} en favoritos`} aria-pressed={saved} onClick={() => { void toggleFavorite(book.id).then(() => toast(saved ? 'Se quitó de favoritos.' : 'Se guardó en favoritos.', 'success')).catch(() => toast('No se pudo actualizar favoritos.', 'warning')); }}><Heart size={16} fill={saved ? 'currentColor' : 'none'} /></button>
      <span className="cover-format">{book.format}</span>
    </div>
    <div className="home-added-copy">
      <span className="home-added-category" title={book.category || 'Sin categoría'}>{book.category || 'Sin categoría'}</span>
      <Link className="home-added-title" to={`/book/${book.id}`} title={book.title}>{book.title}</Link>
      <p className="home-added-author" title={book.authors.join(', ')}>{book.authors.join(', ') || 'Autor no disponible'}</p>
      <span className="home-added-year">{book.year ?? 'Año no disponible'}</span>
      <Link className="button button-primary button-small home-added-read" to={`/reader/${book.id}`}>Leer libro<ArrowRight size={14} /></Link>
    </div>
  </article>;
}

function CategoryTile({ category, count, index, onClick }: { category: LibraryCategory; count: number; index: number; onClick: () => void }) {
  const Icon = iconMap[category.icon];
  return <button className={`category-tile category-tile--${index + 1}`} onClick={onClick}><span className="category-tile-count">0{index + 1}</span><span className="category-tile-icon"><Icon size={21} strokeWidth={1.6} /></span><strong>{category.name}</strong><span className="category-tile-foot">{count} {count === 1 ? 'libro' : 'libros'}<ArrowUpRight size={14} /></span></button>;
}

function booksInCategory(category: LibraryCategory, books: Book[], categories: LibraryCategory[], includeChildren = false) {
  const related = includeChildren ? [category, ...categories.filter((item) => item.parentId === category.id)] : [category];
  const ids = new Set(related.map((item) => item.id));
  const names = new Set(related.map((item) => item.name));
  return books.filter((book) => ids.has(book.categoryId ?? '') || ids.has(book.subcategoryId ?? '') || names.has(book.category) || names.has(book.subcategory ?? '')).length;
}

export function CatalogPage() {
  const { books, categories, loading, error } = useLibrary();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [category, setCategory] = useState(params.get('category') ?? '');
  const [format, setFormat] = useState('');
  const [language, setLanguage] = useState('');
  const [sort, setSort] = useState('newest');
  const [view, setView] = useState<'grid' | 'list'>(() => localStorage.getItem('masterfull-catalog-view') === 'list' ? 'list' : 'grid');
  const [page, setPage] = useState(1);
  const perPage = 8;
  useEffect(() => { setQuery(params.get('q') ?? ''); setCategory(params.get('category') ?? ''); setPage(1); }, [params]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('es');
    const result = books.filter((book) => {
      const matchesQuery = !needle || [book.title, book.subtitle, ...book.authors, book.publisher, book.category, book.subcategory, ...(book.tags ?? [])].filter(Boolean).join(' ').toLocaleLowerCase('es').includes(needle);
      return matchesQuery && (!category || book.category === category || book.subcategory === category) && (!format || book.format === format) && (!language || book.language === language);
    });
    return result.sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title, 'es') : sort === 'oldest' ? a.addedAt.localeCompare(b.addedAt) : b.addedAt.localeCompare(a.addedAt));
  }, [books, category, format, language, query, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const visible = filtered.slice((page - 1) * perPage, page * perPage);
  const activeFilters = [category, format, language].filter(Boolean).length;
  function clearFilters() { setCategory(''); setFormat(''); setLanguage(''); setQuery(''); setParams({}); setPage(1); }
  return <div className="page catalog-page">
    <PageHeading eyebrow="CATÁLOGO GENERAL" title="Catálogo de libros" description="Explora y organiza tu colección de conocimiento." action={<div className="catalog-total"><span>LIBROS DISPONIBLES</span><strong>{books.length}<small> libros</small></strong></div>} />
    {loading && <div className="reader-loading"><strong>Cargando catálogo…</strong></div>}{error && <div className="admin-warning"><LockKeyhole size={16} /><span>{error}</span></div>}
    <div className="catalog-toolbar"><form className="catalog-search" role="search" onSubmit={(event) => { event.preventDefault(); setPage(1); }}><Search size={18} /><label className="sr-only" htmlFor="catalog-search">Buscar por título, autor, etiquetas o categoría</label><input id="catalog-search" placeholder="Título, autor, editorial, tema o etiqueta…" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /><kbd>⌕</kbd></form><div className="filter-set"><label className="filter-select"><span className="sr-only">Categoría</span><select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}><option value="">Todas las categorías</option>{categories.filter((item) => item.active).map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select><ChevronDown size={14} /></label><label className="filter-select filter-select--short"><span className="sr-only">Formato</span><select value={format} onChange={(event) => { setFormat(event.target.value); setPage(1); }}><option value="">Formato</option><option>PDF</option><option>EPUB</option></select><ChevronDown size={14} /></label><label className="filter-select filter-select--short filter-language"><span className="sr-only">Idioma</span><select value={language} onChange={(event) => { setLanguage(event.target.value); setPage(1); }}><option value="">Todos los idiomas</option>{[...new Set(books.map((book) => book.language).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')).map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={14} /></label></div></div>
    <div className="catalog-meta"><div><span>{filtered.length} resultados</span>{activeFilters > 0 && <><i />{activeFilters} filtros activos<button onClick={clearFilters}>Limpiar</button></>}</div><div className="catalog-controls"><label className="sort-select"><ArrowDownAZ size={15} /><select aria-label="Ordenar catálogo" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="newest">Más recientes</option><option value="oldest">Más antiguos</option><option value="title">Título A–Z</option></select><ChevronDown size={14} /></label><span className="control-divider" /><div className="view-toggle" role="group" aria-label="Vista de resultados"><button aria-label="Vista de cuadrícula" aria-pressed={view === 'grid'} onClick={() => { setView('grid'); localStorage.setItem('masterfull-catalog-view', 'grid'); }} className={view === 'grid' ? 'active' : ''}><Grid2X2 size={16} /></button><button aria-label="Vista de lista" aria-pressed={view === 'list'} onClick={() => { setView('list'); localStorage.setItem('masterfull-catalog-view', 'list'); }} className={view === 'list' ? 'active' : ''}><List size={17} /></button></div></div></div>
    {loading ? null : visible.length ? <>{view === 'grid' ? <div className="book-grid">{visible.map((book, index) => <BookCard key={book.id} book={book} index={index} />)}</div> : <div className="catalog-list">{visible.map((book) => <CatalogListRow key={book.id} book={book} />)}</div>}<div className="pagination"><span>Mostrando <strong>{(page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)}</strong> de <strong>{filtered.length}</strong> libros</span><div className="pagination-actions"><button className="icon-button" aria-label="Página anterior" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={17} /></button><span><strong>{page}</strong> / {pages}</span><button className="icon-button" aria-label="Página siguiente" disabled={page >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}><ChevronRight size={17} /></button></div></div></> : <EmptyState title="No encontramos ese libro." description="Prueba con otro título, autor o tema; también puedes quitar algún filtro." action="Limpiar búsqueda" onAction={clearFilters} />}
  </div>;
}

function CatalogListRow({ book }: { book: Book }) {
  const { favorites, toggleFavorite } = useLibrary();
  const toast = useToast();
  const saved = favorites.includes(book.id);
  return <div className="catalog-list-row"><BookCover book={book} /><div className="catalog-list-primary"><span>{book.category} <i>·</i> {book.subcategory}</span><strong>{book.title}</strong><small>{book.authors.join(', ')}</small></div><span className="catalog-list-meta">{book.year ?? '—'}</span><span className="catalog-list-meta">{book.format}</span><button className={`icon-button${saved ? ' is-saved' : ''}`} aria-label={saved ? 'Quitar de favoritos' : 'Agregar a favoritos'} aria-pressed={saved} onClick={() => { toggleFavorite(book.id); toast(saved ? 'Se quitó de favoritos.' : 'Se guardó en favoritos.', 'success'); }}><Heart size={17} fill={saved ? 'currentColor' : 'none'} /></button><Link className="button button-secondary button-small" to={`/reader/${book.id}`}>Leer libro<ArrowUpRight size={14} /></Link></div>;
}

export function CategoriesPage() {
  const { books, categories } = useLibrary();
  const navigate = useNavigate();
  const [selected, setSelected] = useState('');
  const activeCategories = categories.filter((category) => category.active);
  const roots = activeCategories.filter((category) => !category.parentId && (!selected || category.id === selected));
  const [collapsedRoots, setCollapsedRoots] = useState<Set<string>>(new Set());
  return <div className="page categories-page"><PageHeading eyebrow="BIBLIOTECA" title="Categorías y disciplinas" description="Explora la colección por área de conocimiento." /><div className="category-feature"><div className="category-feature-copy"><span className="feature-index">EXPLORAR POR DISCIPLINA</span><h2>Encuentra tu<br />próximo <em>tema.</em></h2><p>Las categorías reflejan la organización actual<br />de tu biblioteca.</p></div><div className="category-feature-art" aria-hidden="true"><Atom size={64} strokeWidth={1} /></div></div>{activeCategories.length > 0 && <div className="category-filter-row"><span>{selected ? `Categoría · ${categories.find((item) => item.id === selected)?.name}` : `${activeCategories.length} categorías`}</span><div className="category-filter-buttons"><button className={!selected ? 'active' : ''} onClick={() => setSelected('')}>Todas</button>{activeCategories.filter((item) => !item.parentId).map((item) => <button key={item.id} className={selected === item.id ? 'active' : ''} onClick={() => setSelected(selected === item.id ? '' : item.id)}>{item.name}</button>)}</div></div>}{roots.length ? <div className="category-tree-grid">{roots.map((root, index) => { const children = activeCategories.filter((item) => item.parentId === root.id); const expanded = !collapsedRoots.has(root.id); return <section className="public-category-group" key={root.id}><div className="public-category-heading"><span className="category-hierarchy-label">Categoría principal</span><button className="category-tree-toggle" aria-expanded={expanded} aria-label={`${expanded ? 'Contraer' : 'Expandir'} ${root.name}`} onClick={() => setCollapsedRoots((current) => { const next = new Set(current); if (next.has(root.id)) next.delete(root.id); else next.add(root.id); return next; })}><ChevronDown size={16} className={expanded ? '' : 'is-collapsed'} />{expanded ? 'Contraer' : 'Expandir'}</button></div><CategoryTile category={root} count={booksInCategory(root, books, categories, true)} index={index} onClick={() => navigate(`/catalog?category=${encodeURIComponent(root.name)}`)} />{expanded && children.length > 0 && <div className="public-category-children">{children.map((child, childIndex) => <div className="public-category-child" key={child.id}><span className="category-hierarchy-branch" aria-hidden="true">↳</span><div className="public-category-child-content"><span className="category-hierarchy-label">Subcategoría de {root.name}</span><CategoryTile category={child} count={booksInCategory(child, books, categories)} index={childIndex} onClick={() => navigate(`/catalog?category=${encodeURIComponent(child.name)}`)} /></div></div>)}</div>}</section>; })}</div> : <EmptyState icon={FolderKanban} title="Aún no hay categorías." description="Las categorías registradas aparecerán aquí cuando se añadan a la biblioteca." />}</div>;
}

export function FavoritesPage() {
  const { books, favorites, loading } = useLibrary();
  const savedBooks = books.filter((book) => favorites.includes(book.id));
  return <div className="page"><PageHeading eyebrow="TU BIBLIOTECA" title="Guardados para después." description="Tus libros favoritos se quedan aquí, listos para cuando tengas un momento." action={<span className="saved-count"><Heart size={15} />{savedBooks.length.toString().padStart(2, '0')} GUARDADOS</span>} />{loading ? <div className="reader-loading"><strong>Cargando favoritos…</strong></div> : savedBooks.length ? <div className="book-grid">{savedBooks.map((book, index) => <BookCard key={book.id} book={book} index={index} />)}</div> : <EmptyState icon={Heart} title="Tu lista está esperando un primer libro." description="Guarda tus libros favoritos desde el catálogo." />}</div>;
}

export function HistoryPage() {
  const { books, recentBooks, loading } = useLibrary();
  const recent = recentBooks.map((entry) => ({ ...entry, book: books.find((book) => book.id === entry.id) })).filter((entry): entry is typeof entry & { book: Book } => Boolean(entry.book));
  return <div className="page" id="continue-reading"><PageHeading eyebrow="MI ESPACIO" title="Historial de lectura" description="Libros que abriste recientemente." /><div className="history-note"><span className="history-note-icon"><Clock3 size={18} /></span><p>Google Drive no permite que la plataforma guarde la página exacta.</p></div>{loading ? <div className="reader-loading"><strong>Cargando historial…</strong></div> : recent.length ? <div className="history-list">{recent.map(({ id, viewedAt, book }, index) => <div className="history-item" key={id}><span className="history-order">{(index + 1).toString().padStart(2, '0')}</span><span className="history-cover"><BookCover book={book} /></span><span className="history-book-copy"><small>{book.category} <i>·</i> CONSULTADO RECIENTEMENTE</small><strong>{book.title}</strong><span>{book.authors[0]} · {book.format}{viewedAt ? ` · ${new Date(viewedAt).toLocaleDateString('es-PE')}` : ''}</span></span><Link className="button button-secondary button-small" to={`/reader/${book.id}`}>Leer libro<ArrowUpRight size={14} /></Link></div>)}</div> : <EmptyState icon={History} title="Aquí aparecerán tus lecturas." description="Abre un libro para que aparezca en tu historial." />}</div>;
}
function formatBookAddedDate(value: string) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Lima' }).format(date);
}

export function BookDetailPage() {
  const { id = '' } = useParams();
  const { books, favorites, loading, toggleFavorite } = useLibrary();
  const toast = useToast();
  const navigate = useNavigate();
  const book = books.find((item) => item.id === id);
  if (!book && loading) return <div className="page"><div className="reader-loading"><strong>Cargando libro…</strong></div></div>;
  if (!book) return <div className="page"><EmptyState title="No encontramos ese libro." description="Vuelve al catálogo para elegir otra lectura." action="Ir al catálogo" onAction={() => navigate('/catalog')} /></div>;
  const saved = favorites.includes(book.id);
  const metadata = [['Autoría', book.authors.join(', ')], ['Editorial', book.publisher], ['Año', book.year?.toString()], ['Edición', book.edition], ['ISBN', book.isbn], ['Idioma', book.language], ['Categoría', `${book.category}${book.subcategory ? ` / ${book.subcategory}` : ''}`], ['Formato', book.format], ['Páginas', book.pages?.toString()], ['Tamaño', book.sizeLabel], ['Incorporado', formatBookAddedDate(book.addedAt)]];
  return <div className="page book-detail-page"><button className="back-link" onClick={() => navigate(-1)}><ArrowLeft size={16} />Volver al catálogo</button><div className="book-detail-layout"><div className="detail-cover-frame"><BookCover book={book} large />{book.demo && <span className="detail-demo-stamp">DOCUMENTO DE DEMOSTRACIÓN</span>}</div><div className="book-detail-copy"><div className="detail-kicker"><span className="category-pin" />{book.category || 'Sin categoría'} {book.subcategory && <><i>·</i>{book.subcategory}</>}{book.demo && <span className="book-demo-tag">DEMO</span>}</div><h1>{book.title}</h1>{book.subtitle && <p className="detail-subtitle">{book.subtitle}</p>}<div className="detail-authors"><span className="author-monogram">{book.authors[0]?.slice(0, 1).toUpperCase() || '?'}</span><span><small>POR</small><strong>{book.authors.join(', ') || 'Autor no disponible'}</strong></span></div><p className="detail-description">{book.description}</p><div className="detail-actions"><button className="button button-gold" onClick={() => navigate(`/reader/${book.id}`)}><BookOpen size={16} />Leer libro<ArrowRight size={16} /></button><button className={`button button-outline${saved ? ' button-outline--saved' : ''}`} aria-pressed={saved} onClick={() => { toggleFavorite(book.id); toast(saved ? 'Se quitó de favoritos.' : 'Se guardó en favoritos.', 'success'); }}><Heart size={16} fill={saved ? 'currentColor' : 'none'} />{saved ? 'Guardado' : 'Guardar en favoritos'}</button></div><div className="detail-info-head"><span>DETALLES DEL LIBRO</span><i /></div><dl className="detail-metadata">{metadata.filter(([, value]) => Boolean(value)).map(([label, value]) => <div key={label}><dt>{label}</dt><dd className={label === 'ISBN' ? 'metadata-isbn' : undefined} title={String(value)}>{value}</dd></div>)}</dl>{book.demo && <div className="detail-demo-note"><span className="demo-data-mark">i</span>Registro ficticio de demostración.</div>}</div></div></div>;
}

export function AdminPage() {
  const { categories, books, addCategory, updateCategory, deleteCategory, toggleCategory } = useLibrary();
  const { user } = useAuth();
  const toast = useToast();
  const [newName, setNewName] = useState('');
  const [parentCategoryId, setParentCategoryId] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState('');
  const [collapsedCategoryRoots, setCollapsedCategoryRoots] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<'overview' | 'requests' | 'books' | 'categories' | 'sync'>('overview');
  const rootCategories = categories.filter((item) => !item.parentId);
  function resetCategoryForm() { setEditingCategoryId(''); setNewName(''); setParentCategoryId(''); }
  function editCategory(category: LibraryCategory) { setEditingCategoryId(category.id); setNewName(category.name); setParentCategoryId(category.parentId ?? ''); }
  async function submitCategory(event: FormEvent) { event.preventDefault(); if (!newName.trim()) return; try { if (editingCategoryId) { await updateCategory(editingCategoryId, newName); toast('Categoría actualizada.', 'success'); } else { await addCategory(newName, parentCategoryId || null); toast('Categoría creada en Firestore.', 'success'); } resetCategoryForm(); } catch (reason) { toast(reason instanceof Error ? reason.message : 'No se pudo guardar la categoría.', 'warning'); } }
  async function removeCategory(category: LibraryCategory) { if (!window.confirm(`¿Eliminar “${category.name}”? Solo se puede eliminar si no tiene libros ni subcategorías.`)) return; try { await deleteCategory(category.id); if (editingCategoryId === category.id) resetCategoryForm(); toast('Categoría eliminada.', 'success'); } catch (reason) { toast(reason instanceof Error ? reason.message : 'No se pudo eliminar la categoría.', 'warning'); } }
  return <div className="page admin-page"><PageHeading eyebrow="ADMINISTRACIÓN" title="La biblioteca, a tu manera." description="Administra libros, categorías y solicitudes de acceso." action={<span className="admin-role-chip"><ShieldCheck size={15} />ADMINISTRADOR</span>} /><div className="admin-tabs" role="tablist" aria-label="Secciones de administración"><button role="tab" aria-selected={tab === 'overview'} className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Resumen</button><button role="tab" aria-selected={tab === 'requests'} className={tab === 'requests' ? 'active' : ''} onClick={() => setTab('requests')}>Solicitudes de acceso</button><button role="tab" aria-selected={tab === 'books'} className={tab === 'books' ? 'active' : ''} onClick={() => setTab('books')}>Libros <span>{books.length}</span></button><button role="tab" aria-selected={tab === 'categories'} className={tab === 'categories' ? 'active' : ''} onClick={() => setTab('categories')}>Categorías <span>{categories.length}</span></button><button role="tab" aria-selected={tab === 'sync'} className={tab === 'sync' ? 'active' : ''} onClick={() => setTab('sync')}>Archivos</button></div>
    {tab === 'overview' && <div className="admin-overview">
      <div className="admin-summary-grid"><SummaryCard label="LIBROS" value={books.length.toString().padStart(2, '0')} icon={BookOpen} note="Registros actuales"/><SummaryCard label="CATEGORÍAS ACTIVAS" value={categories.filter((item) => item.active).length.toString().padStart(2, '0')} icon={FolderKanban} note="Disponibles en catálogo"/><SummaryCard label="SIN ENLACE DE LECTURA" value={books.filter((book) => !book.driveFileId && !book.driveUrl && !book.fileReference).length.toString().padStart(2, '0')} icon={Cloud} note="Requieren un enlace de Drive"/></div>
      <div className="admin-columns"><section className="admin-panel"><div className="admin-panel-heading"><div><span className="panel-overline">CUENTA ACTUAL</span><h2>Administrador</h2></div><span className="panel-count">ACTIVA</span></div><div className="user-row"><span className="avatar avatar--large">{(user?.displayName || user?.email || 'U').slice(0, 2).toUpperCase()}</span><span className="user-row-copy"><strong>{user?.displayName || user?.email?.split('@')[0] || 'Usuario'}</strong><small>{user?.email}</small></span><span className="role-pill">ADMIN<ShieldCheck size={12} /></span></div></section><section className="admin-panel sync-teaser"><div className="admin-panel-heading"><div><span className="panel-overline">ARCHIVOS</span><h2>Google Drive</h2></div><span className="connect-status"><i />ENLACES MANUALES</span></div><p>Registra el enlace de cada PDF desde la pestaña Libros. El visor abre el documento dentro de esta plataforma.</p><button className="text-link" onClick={() => setTab('books')}>Registrar un libro<ArrowRight size={15} /></button></section></div>
    </div>}{tab === 'requests' && <AccessRequestsManager />}    {tab === 'books' && <AdminBooksManager />}
    {tab === 'categories' && <div className="admin-category-layout"><section className="admin-panel category-manager-panel"><div className="admin-panel-heading"><div><span className="panel-overline">COLECCIÓN TEMÁTICA</span><h2>{editingCategoryId ? 'Editar categoría' : 'Gestiona categorías'}</h2></div><span className="panel-count">{categories.length} en total</span></div><form className="add-category-form" onSubmit={submitCategory}><label className="sr-only" htmlFor="new-category">Nombre de categoría</label><input id="new-category" maxLength={80} placeholder={editingCategoryId ? 'Nombre de categoría' : 'Nombre de categoría o subcategoría'} value={newName} onChange={(event) => setNewName(event.target.value)} /><select aria-label="Categoría superior" value={parentCategoryId} onChange={(event) => setParentCategoryId(event.target.value)} disabled={Boolean(editingCategoryId)}><option value="">Categoría principal</option>{rootCategories.filter((item) => item.id !== editingCategoryId).map((item) => <option key={item.id} value={item.id}>Subcategoría de {item.name}</option>)}</select><button className="button button-primary button-small" type="submit" disabled={!newName.trim()}>{editingCategoryId ? <><Check size={15} />Guardar</> : <><Plus size={15} />Añadir</>}</button>{editingCategoryId && <button className="button button-secondary button-small" type="button" onClick={resetCategoryForm}>Cancelar</button>}</form><div className="managed-category-list">{rootCategories.map((root, index) => { const children = categories.filter((item) => item.parentId === root.id); const expanded = !collapsedCategoryRoots.has(root.id); const toggle = (item: LibraryCategory) => { const action = item.active ? 'desactivar' : 'activar'; if (window.confirm(`¿Deseas ${action} la categoría “${item.name}”?`)) void toggleCategory(item.id).catch(() => toast('No se pudo cambiar el estado de la categoría.', 'warning')); }; return <div className="managed-category-group" key={root.id}><ManagedCategory category={root} count={booksInCategory(root, books, categories, true)} index={index} depth={0} hasChildren={children.length > 0} expanded={expanded} onExpand={() => setCollapsedCategoryRoots((current) => { const next = new Set(current); if (next.has(root.id)) next.delete(root.id); else next.add(root.id); return next; })} onEdit={() => editCategory(root)} onDelete={() => void removeCategory(root)} onToggle={() => toggle(root)} />{expanded && children.map((child, childIndex) => <ManagedCategory key={child.id} category={child} count={booksInCategory(child, books, categories)} index={childIndex} depth={1} onEdit={() => editCategory(child)} onDelete={() => void removeCategory(child)} onToggle={() => toggle(child)} />)}</div>; })}</div></section><aside className="admin-side-note"><span className="side-note-icon"><CircleHelp size={17} /></span><strong>Categorías del catálogo</strong><p>Las subcategorías aparecen anidadas bajo su categoría principal. Puedes añadir, renombrar, activar o desactivar; para eliminar, primero reasigna los libros y elimina o reasigna las subcategorías.</p></aside></div>}
    {tab === 'sync' && <div className="sync-layout"><section className="sync-hero-card"><div className="sync-cloud-icon"><Cloud size={24} /></div><span className="panel-overline">LECTURA MEDIANTE ENLACES</span><h2>Archivos en Google Drive.</h2><p>Sube el PDF a tu Google Drive y pega su enlace al registrar el libro. La plataforma prepara ese enlace para abrirse en el lector integrado.</p><div className="sync-status-row"><span>Sincronización automática: desactivada</span><span>Google Drive API: no utilizada</span></div><small className="sync-button-note">Configura cada documento como “Cualquier persona con el enlace · Lector”. Cualquier persona que reciba ese enlace puede acceder fuera de Masterfull Library.</small><a className="button button-secondary" href="https://drive.google.com/drive/my-drive" target="_blank" rel="noreferrer">Abrir Google Drive<ArrowRight size={15} /></a><button className="button button-secondary" onClick={() => setTab('books')}>Ir a registrar libros<ArrowRight size={15} /></button></section></div>}  </div>;
}

function AccessRequestsManager() {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingUid, setWorkingUid] = useState('');
  const [error, setError] = useState('');
  const toast = useToast();
  async function load() {
    setLoading(true); setError('');
    try { setRequests(await fetchAccessRequests()); }
    catch { setError('No fue posible cargar las solicitudes. Comprueba que esta cuenta tenga el claim de administrador, un perfil activo y permisos en las reglas de Firestore.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function act(request: AccessRequest, action: 'approveAccessRequest' | 'rejectAccessRequest' | 'setUserSuspended' | 'reactivateUser') {
    setWorkingUid(request.uid); setError('');
    try {
      await manageAccessRequest(action, request.uid);
      const messages = { approveAccessRequest: 'Cuenta aprobada.', rejectAccessRequest: 'Solicitud rechazada.', setUserSuspended: 'Cuenta suspendida.', reactivateUser: 'Cuenta reactivada.' };
      toast(messages[action], 'success');
      await load();
    } catch (reason) {
      const code = typeof reason === 'object' && reason && 'code' in reason ? String(reason.code) : '';
      const message = code.includes('failed-precondition') ? 'La acción requiere un correo verificado y un estado de cuenta válido.' : code.includes('permission-denied') ? 'Firestore denegó la acción. Se requiere una cuenta administradora activa y reglas actualizadas.' : 'No se pudo completar la acción. Revisa la conexión con Firebase.';
      setError(message);
    } finally { setWorkingUid(''); }
  }
  const statusLabel = { pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado', suspended: 'Suspendido' };
  return <section className="admin-panel access-requests-panel"><div className="admin-panel-heading"><div><span className="panel-overline">CONTROL DE ACCESO</span><h2>Solicitudes de acceso</h2></div><button className="button button-secondary button-small" onClick={() => void load()} disabled={loading}><RefreshCw size={14} />Actualizar</button></div><p className="admin-empty-copy">Antes de aprobar, confirma en Firebase Authentication que ese correo siga verificado.</p>{error && <p className="auth-error" role="alert">{error}</p>}{loading ? <p className="admin-empty-copy">Cargando solicitudes…</p> : !requests.length ? <p className="admin-empty-copy">Todavía no hay solicitudes.</p> : <div className="access-request-list">{requests.map((request) => <article className="access-request-row" key={request.uid}><div className="access-request-person"><strong>{request.nombre}</strong><span>{request.correo}</span><small>{request.createdAt ? new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(request.createdAt)) : 'Fecha no disponible'}</small></div><span className={`access-request-status access-request-status--${request.estado}`}>{statusLabel[request.estado]}</span><span className={`access-request-verified${request.emailVerified ? ' is-verified' : ''}`}>{request.emailVerified ? 'Correo verificado' : 'Correo sin verificar'}</span><div className="access-request-actions">{request.estado === 'pending' && <><button className="button button-primary button-small" disabled={!request.emailVerified || workingUid === request.uid} title={!request.emailVerified ? 'El usuario debe verificar su correo' : undefined} onClick={() => void act(request, 'approveAccessRequest')}><Check size={14} />Aprobar</button><button className="button button-secondary button-small" disabled={workingUid === request.uid} onClick={() => void act(request, 'rejectAccessRequest')}><X size={14} />Rechazar</button></>}{request.estado === 'approved' && <button className="button button-secondary button-small" disabled={workingUid === request.uid} onClick={() => void act(request, 'setUserSuspended')}>Suspender</button>}{request.estado === 'suspended' && <button className="button button-primary button-small" disabled={!request.emailVerified || workingUid === request.uid} onClick={() => void act(request, 'reactivateUser')}>Reactivar</button>}</div></article>)}</div>}</section>;
}

function CoverDimensions({ value, onStatusChange }: { value: string; onStatusChange: (status: 'empty' | 'loading' | 'valid' | 'invalid') => void }) {
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const imageUrl = resolveCoverImageUrl(value);
  useEffect(() => { setDimensions(null); setFailed(false); onStatusChange(value.trim() ? imageUrl ? 'loading' : 'invalid' : 'empty'); }, [value, imageUrl, onStatusChange]);
  if (!imageUrl) return value.trim() ? <span className="cover-url-invalid" role="alert">La URL debe ser una imagen HTTPS directa; no puede ser un PDF ni una vista previa de Drive.</span> : null;
  return <div className="cover-dimension-preview" aria-live="polite">
    {!failed ? <img key={imageUrl} src={imageUrl} alt="Vista previa de la portada seleccionada" loading="lazy" onLoad={(event) => { setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); onStatusChange('valid'); }} onError={() => { setFailed(true); onStatusChange('invalid'); }} /> : <span>No se pudo cargar esta imagen. Comprueba que el enlace sea público y directo.</span>}
    <div>{dimensions ? <><strong>Resolución real: {dimensions.width} × {dimensions.height} px</strong>{(dimensions.width < 450 || dimensions.height < 650) && <span className="cover-low-resolution" role="status">Esta portada puede verse poco nítida al ampliarla. Puedes reemplazarla por una imagen HTTPS de mayor resolución.</span>}</> : !failed && <span>Midiendo dimensiones de la imagen…</span>}</div>
  </div>;
}

function AdminBooksManager() {
  const { books, categories, saveBook, archiveBook, deleteBook, setBookActive, loading, error } = useLibrary();
  const toast = useToast();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Book | null>(null);
  const [search, setSearch] = useState('');
  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [publisher, setPublisher] = useState('');
  const [year, setYear] = useState('');
  const [isbn, setIsbn] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [language, setLanguage] = useState('Español');
  const [format, setFormat] = useState<'PDF' | 'EPUB'>('PDF');
  const [tags, setTags] = useState('');
  const [reference, setReference] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [coverMethod, setCoverMethod] = useState<'automatic' | 'upload' | 'url'>('automatic');
  const [localCoverPending, setLocalCoverPending] = useState(false);
  const [localPickerVersion, setLocalPickerVersion] = useState(0);
  const [coverUrlStatus, setCoverUrlStatus] = useState<'empty' | 'loading' | 'valid' | 'invalid'>('empty');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const handleCoverUrlStatus = useCallback((status: 'empty' | 'loading' | 'valid' | 'invalid') => setCoverUrlStatus(status), []);
  function reset() { setEditing(null); setTitle(''); setAuthors(''); setPublisher(''); setYear(''); setIsbn(''); setCategoryId(''); setSubcategoryId(''); setLanguage('Español'); setFormat('PDF'); setTags(''); setReference(''); setCoverUrl(''); setCoverMethod('automatic'); setCoverUrlStatus('empty'); setLocalCoverPending(false); setLocalPickerVersion((version) => version + 1); setDescription(''); }
  function openCreate() { reset(); setFormOpen(true); }
  function edit(book: Book) { setEditing(book); setTitle(book.title); setAuthors(book.authors.join(', ')); setPublisher(book.publisher ?? ''); setYear(book.year?.toString() ?? ''); setIsbn(book.isbn ?? ''); setCategoryId(book.categoryId ?? ''); setSubcategoryId(book.subcategoryId ?? ''); setLanguage(book.language); setFormat(book.format); setTags(book.tags?.join(', ') ?? ''); setReference(book.driveUrl ?? book.fileReference ?? ''); setCoverUrl(book.coverUrl ?? ''); setCoverMethod(book.coverUrl ? 'url' : 'automatic'); setCoverUrlStatus(book.coverUrl ? 'loading' : 'empty'); setLocalCoverPending(false); setLocalPickerVersion((version) => version + 1); setDescription(book.description); setFormOpen(true); }
  useEffect(() => { if (!formOpen) return; const dialog = dialogRef.current; if (dialog && !dialog.open) dialog.showModal(); requestAnimationFrame(() => titleInputRef.current?.focus()); }, [formOpen]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !authors.trim() || !categoryId || !description.trim() || !reference.trim()) return;
    if (localCoverPending) { toast('Guarda la portada en el proyecto, publícala con Git y confirma que GitHub Pages la sirve antes de guardar el libro.', 'warning'); return; }
    setSaving(true);
    try {
      const drive = normalizeDriveFile(reference);
      const cover = resolveCoverImageUrl(coverUrl, drive.driveUrl);
      if (coverUrl.trim() && !cover) throw new Error('La portada debe ser una URL HTTPS directa de imagen. No uses el enlace del PDF ni una vista previa de Drive.');
      if (coverUrl.trim() && coverUrlStatus !== 'valid') throw new Error(coverUrlStatus === 'loading' ? 'Espera a que termine de comprobarse la imagen de portada.' : 'La URL seleccionada no responde con una imagen válida. Comprueba el enlace antes de guardar.');
      if (editing?.coverUrl && editing.coverUrl !== cover && !window.confirm('Este cambio reemplazará o quitará la portada guardada. ¿Quieres continuar?')) return;
      await saveBook({ id: editing?.id, title, authors: authors.split(',').map((entry) => entry.trim()).filter(Boolean), publisher, year: year ? Number(year) : undefined, isbn, categoryId, subcategoryId: subcategoryId || '', category: categories.find((item) => item.id === categoryId)?.name ?? '', subcategory: categories.find((item) => item.id === subcategoryId)?.name ?? '', language, format, tags: tags.split(',').map((entry) => entry.trim()).filter(Boolean), coverUrl: cover, fileProvider: 'google_drive', fileReference: drive.driveUrl, driveFileId: drive.driveFileId, driveUrl: drive.driveUrl, description, active: editing?.active ?? true });
      toast(editing ? 'Libro actualizado.' : 'Libro registrado.', 'success'); dialogRef.current?.close();
    } catch (reason) { toast(reason instanceof Error ? reason.message : 'No se pudo guardar el libro.', 'warning'); }
    finally { setSaving(false); }
  }
  const visible = books.filter((book) => [book.title, ...book.authors, book.isbn ?? ''].join(' ').toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')));
  return <div className="admin-books-page">
    <PageHeading eyebrow="ADMINISTRACIÓN · COLECCIÓN" title="Libros" description="Organiza los títulos, sus portadas y los enlaces de lectura." action={<button className="button button-primary" onClick={openCreate}><Plus size={17} />Nuevo libro</button>} />
    <section className="admin-book-metrics" aria-label="Resumen de libros"><div><span>Total de libros</span><strong>{books.length}</strong></div><div><span>Libros activos</span><strong>{books.filter((book) => book.active !== false).length}</strong></div><div><span>Categorías activas</span><strong>{categories.filter((item) => item.active).length}</strong></div></section>
    <section className="admin-panel admin-books-catalog" aria-labelledby="admin-books-heading">
      <div className="admin-books-toolbar"><div><h2 id="admin-books-heading">Catálogo</h2><p>Busca y administra los libros de la biblioteca.</p></div><label className="catalog-search"><Search size={17} /><span className="sr-only">Buscar por título, autor o ISBN</span><input placeholder="Título, autor o ISBN" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
      <div className="admin-books-result-count" aria-live="polite">{loading ? 'Cargando libros…' : `${visible.length} de ${books.length} libros`}</div>{error && <div className="admin-warning" role="alert"><LockKeyhole size={16} /><span>{error}</span></div>}
      <div className="admin-book-table" role="table" aria-label="Libros registrados"><div className="admin-book-table-head" role="row"><span role="columnheader">Portada</span><span role="columnheader">Libro</span><span role="columnheader">Categoría</span><span role="columnheader">Formato</span><span role="columnheader">Estado</span><span role="columnheader">Acciones</span></div>
        <div className="admin-book-list" role="rowgroup">{!loading && visible.map((book) => <div className="admin-book-row" role="row" key={book.id}>
          <span className="admin-book-cover-cell" role="cell"><BookCover book={book} /></span><span className="admin-book-primary" role="cell"><strong title={book.title}>{book.title}</strong><small title={book.authors.join(', ')}>{book.authors.join(', ') || 'Autor no disponible'}</small></span>
          <span className="admin-book-category" role="cell" data-label="Categoría">{book.subcategory ? <>{book.category || 'Sin categoría'}<small>{book.subcategory}</small></> : book.category || 'Sin categoría'}</span><span className="admin-book-format" role="cell" data-label="Formato">{book.format}</span><span className="admin-book-status-cell" role="cell"><span className={`admin-book-status${book.active === false ? ' is-inactive' : ''}`}>{book.active === false ? 'Archivado' : 'Activo'}</span></span>
          <span className="admin-book-actions" role="cell"><button className="button button-secondary button-small" onClick={() => edit(book)}><Pencil size={14} />Editar</button><details className="admin-book-more"><summary aria-label={`Más acciones para ${book.title}`}><Ellipsis size={18} /></summary><div className="admin-book-menu"><button disabled={saving} onClick={async () => { const next = book.active === false; if (!window.confirm(next ? `¿Reactivar “${book.title}”?` : `¿Archivar “${book.title}”?`)) return; try { if (next) await setBookActive(book.id, true); else await archiveBook(book.id); toast(next ? 'Libro reactivado.' : 'Libro archivado.', 'success'); } catch { toast('No se pudo cambiar el estado del libro.', 'warning'); } }}>{book.active === false ? 'Reactivar' : 'Archivar'}</button><button className="managed-delete" disabled={saving} onClick={async () => { if (!window.confirm(`¿Eliminar permanentemente “${book.title}”? Esta acción no se puede deshacer.`)) return; try { await deleteBook(book.id); toast('Libro eliminado.', 'success'); } catch { toast('No se pudo eliminar el libro.', 'warning'); } }}><Trash2 size={14} />Eliminar</button></div></details></span>
        </div>)}{!loading && !visible.length && <div className="admin-books-empty"><BookOpen size={22} /><strong>{books.length ? 'No encontramos libros.' : 'Aún no hay libros.'}</strong><span>{books.length ? 'Prueba con otro título, autor o ISBN.' : 'Agrega el primer libro para completar la colección.'}</span>{!books.length && <button className="button button-secondary button-small" onClick={openCreate}><Plus size={15} />Nuevo libro</button>}</div>}</div>
      </div>
    </section>
    <dialog className="admin-book-dialog" ref={dialogRef} aria-labelledby="admin-book-dialog-title" onClose={() => { setFormOpen(false); reset(); }} onClick={(event) => { if (event.target === dialogRef.current) dialogRef.current?.close(); }}>
      <div className="admin-book-dialog-header"><div><span className="panel-overline">{editing ? 'ACTUALIZAR REGISTRO' : 'NUEVO REGISTRO'}</span><h2 id="admin-book-dialog-title">{editing ? 'Editar libro' : 'Agregar libro'}</h2><p>{editing ? 'Actualiza los datos y guarda los cambios.' : 'Completa la información para añadirlo a tu biblioteca.'}</p></div><button className="icon-button" type="button" aria-label="Cerrar formulario" onClick={() => dialogRef.current?.close()}><X size={18} /></button></div>
      <form className="admin-book-form admin-book-dialog-form" onSubmit={submit}>
        <fieldset className="admin-book-form-section"><legend>Información básica</legend><label>Título<input ref={titleInputRef} required value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Autor o autores<input required placeholder="Separa con comas" value={authors} onChange={(event) => setAuthors(event.target.value)} /></label><label>Editorial<input value={publisher} onChange={(event) => setPublisher(event.target.value)} /></label><label>Año<input type="number" min="1000" max="2100" value={year} onChange={(event) => setYear(event.target.value)} /></label><label>ISBN<input value={isbn} onChange={(event) => setIsbn(event.target.value)} /></label></fieldset>
        <fieldset className="admin-book-form-section"><legend>Clasificación</legend><label>Categoría principal<select required value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setSubcategoryId(''); }}><option value="">Elige una categoría principal</option>{categories.filter((item) => !item.parentId && item.active).map((item) => <option key={item.id} value={item.id}>{item.name} · {booksInCategory(item, books, categories, true)} libros</option>)}</select></label><label>Subcategoría<select disabled={!categoryId} value={subcategoryId} onChange={(event) => setSubcategoryId(event.target.value)}><option value="">{categoryId ? 'Sin subcategoría' : 'Elige primero la categoría principal'}</option>{categories.filter((item) => item.parentId === categoryId && item.active).map((item) => <option key={item.id} value={item.id}>↳ {item.name} · {booksInCategory(item, books, categories)} libros</option>)}</select></label><label>Idioma<input required value={language} onChange={(event) => setLanguage(event.target.value)} /></label><label>Formato<select value={format} onChange={(event) => setFormat(event.target.value as 'PDF' | 'EPUB')}><option>PDF</option><option>EPUB</option></select></label><label className="admin-book-form-wide">Etiquetas<input placeholder="Separadas con comas" value={tags} onChange={(event) => setTags(event.target.value)} /></label></fieldset>
        <fieldset className="admin-book-form-section admin-book-form-wide"><legend>Portada</legend><section className="cover-manager" aria-labelledby="cover-manager-title"><div className="cover-manager-heading"><strong id="cover-manager-title">Portada del libro</strong><span>{coverUrl ? 'Hay una portada en el formulario' : 'Opcional'}</span></div><div className="cover-method-tabs" role="tablist" aria-label="Método para elegir portada"><button id="cover-tab-automatic" role="tab" aria-selected={coverMethod === 'automatic'} aria-controls="cover-panel-automatic" type="button" className={coverMethod === 'automatic' ? 'active' : ''} onClick={() => setCoverMethod('automatic')}>Buscar automáticamente</button>{import.meta.env.DEV && <button id="cover-tab-upload" role="tab" aria-selected={coverMethod === 'upload'} aria-controls="cover-panel-upload" type="button" className={coverMethod === 'upload' ? 'active' : ''} onClick={() => setCoverMethod('upload')}>Subir imagen</button>}<button id="cover-tab-url" role="tab" aria-selected={coverMethod === 'url'} aria-controls="cover-panel-url" type="button" className={coverMethod === 'url' ? 'active' : ''} onClick={() => setCoverMethod('url')}>Pegar URL</button></div><div id="cover-panel-automatic" className="cover-method-panel" role="tabpanel" aria-labelledby="cover-tab-automatic" hidden={coverMethod !== 'automatic'}><GoogleBooksCoverPicker isbn={isbn} title={title} author={authors} selectedCover={coverUrl} onUseCover={(nextUrl) => { setCoverUrl(nextUrl); setCoverUrlStatus('loading'); setCoverMethod('url'); }} /></div>{import.meta.env.DEV && <div id="cover-panel-upload" className="cover-method-panel" role="tabpanel" aria-labelledby="cover-tab-upload" hidden={coverMethod !== 'upload'}><LocalCoverPicker key={localPickerVersion} onPendingChange={setLocalCoverPending} onUseCover={(nextUrl) => { setCoverUrl(nextUrl); setCoverUrlStatus('loading'); setCoverMethod('url'); }} /></div>}<div id="cover-panel-url" className="cover-method-panel" role="tabpanel" aria-labelledby="cover-tab-url" hidden={coverMethod !== 'url'}><label>URL HTTPS de imagen<input type="url" placeholder="https://sitio.com/portada.jpg" value={coverUrl} onChange={(event) => { const nextUrl = event.target.value; setCoverUrl(nextUrl); setCoverUrlStatus(nextUrl.trim() ? 'loading' : 'empty'); }} /><small>Debe ser un enlace directo a la imagen, no al PDF ni a su vista previa. Una portada guardada solo cambia cuando confirmas el guardado.</small><CoverDimensions value={coverUrl} onStatusChange={handleCoverUrlStatus} /></label></div></section></fieldset>
        <fieldset className="admin-book-form-section"><legend>Contenido</legend><label className="admin-book-form-wide">Enlace de Google Drive (PDF)<input type="url" required placeholder="https://drive.google.com/file/d/…/view" value={reference} onChange={(event) => setReference(event.target.value)} /><small>En Drive, configura “Cualquier persona con el enlace · Lector”. El archivo será accesible a quien tenga su enlace.</small></label><label className="admin-book-form-wide">Descripción<textarea required rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></label></fieldset>
        <div className="admin-book-form-actions"><button className="button button-secondary" type="button" onClick={() => dialogRef.current?.close()}>Cancelar</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar libro'}</button></div>
      </form>
    </dialog>
  </div>;
}

function SummaryCard({ label, value, icon: Icon, note }: { label: string; value: string; icon: LucideIcon; note: string }) { return <div className="admin-summary-card"><div><span>{label}</span><Icon size={17} /></div><strong>{value}</strong><small>{note}</small></div>; }
function ManagedCategory({ category, count, index, depth, parentName, hasChildren = false, expanded = false, onExpand, onEdit, onDelete, onToggle }: { category: LibraryCategory; count: number; index: number; depth: 0 | 1; parentName?: string; hasChildren?: boolean; expanded?: boolean; onExpand?: () => void; onEdit: () => void; onDelete: () => void; onToggle: () => void }) { const Icon = iconMap[category.icon]; return <div className={`managed-category${depth ? ' is-child' : ''}${!category.active ? ' is-inactive' : ''}`}><span className="managed-order">{depth ? '↳' : (index + 1).toString().padStart(2, '0')}</span><span className="managed-icon"><Icon size={17} /></span><span className="managed-name"><strong>{category.name}</strong><small>{depth ? `Subcategoría de ${parentName} · ` : 'Categoría principal · '}{count} {count === 1 ? 'libro' : 'libros'}{!depth && hasChildren ? ' en total' : ''} · {category.active ? 'Activa' : 'Inactiva'}</small></span>{hasChildren ? <button className="managed-expand-button" aria-expanded={expanded} aria-label={`${expanded ? 'Contraer' : 'Expandir'} ${category.name}`} title={expanded ? 'Contraer subcategorías' : 'Expandir subcategorías'} onClick={onExpand}><ChevronDown size={16} className={expanded ? '' : 'is-collapsed'} /></button> : <span className="managed-expand-spacer" /> }<button className={`status-toggle${category.active ? ' active' : ''}`} role="switch" aria-checked={category.active} aria-label={`${category.active ? 'Desactivar' : 'Activar'} ${category.name}`} onClick={onToggle}><i /></button><span className="managed-actions"><button className="icon-button" aria-label={`Editar ${category.name}`} title="Editar" onClick={onEdit}><Pencil size={14} /></button><button className="icon-button managed-delete" aria-label={`Eliminar ${category.name}`} title="Eliminar" onClick={onDelete}><Trash2 size={14} /></button></span></div>; }

export function SettingsPage() {
  const { user, emailVerified, resendVerification, refreshAccess } = useAuth();
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState('');
  async function sendVerification() {
    setVerificationBusy(true); setVerificationMessage('');
    try { await resendVerification(); setVerificationMessage('Correo enviado. Revisa tu bandeja de entrada y spam.'); }
    catch { setVerificationMessage('No se pudo enviar el correo. Comprueba la conexión e inténtalo de nuevo.'); }
    finally { setVerificationBusy(false); }
  }
  async function confirmVerification() {
    setVerificationBusy(true); setVerificationMessage('');
    try { const verified = await refreshAccess(); setVerificationMessage(verified ? 'El correo aparece verificado en Firebase Authentication.' : 'Aún no aparece la verificación. Abre el enlace del correo y vuelve a intentarlo.'); }
    catch { setVerificationMessage('No se pudo consultar Firebase. Comprueba la conexión e inténtalo de nuevo.'); }
    finally { setVerificationBusy(false); }
  }
  return <div className="page settings-page"><PageHeading eyebrow="PREFERENCIAS" title="Configuración" description="Cuenta, lectura y servicios usados por la biblioteca." /><div className="settings-layout"><div className="settings-nav" aria-label="Secciones de configuración"><span className="active"><BookOpen size={16} />Lectura</span><span><ShieldCheck size={16} />Cuenta</span><span><Cloud size={16} />Archivos</span></div><div className="settings-content"><section className="settings-section"><div><span className="panel-overline">LECTURA</span><h2>Preferencias de lectura</h2><p>Estas opciones se aplican a este navegador.</p></div><SettingToggle title="Vista en cuadrícula" note="Usar portadas como vista inicial" active /><SettingToggle title="Guardar búsquedas recientes" note="Mantener búsquedas en este dispositivo" active /></section><section className="settings-section"><div><span className="panel-overline">CUENTA Y SERVICIOS</span><h2>Estado de la biblioteca</h2></div><div className="settings-info-line"><span className="privacy-symbol"><ShieldCheck size={16} /></span><span><strong>{user?.email || 'Cuenta autenticada'}</strong><small>{emailVerified ? 'Correo verificado en Firebase Authentication.' : 'Correo todavía sin verificar.'}</small></span></div>{!emailVerified && <div className="verification-actions"><button className="button button-secondary button-small" disabled={verificationBusy} onClick={() => void sendVerification()}>{verificationBusy ? 'Enviando…' : 'Enviar correo de verificación'}</button><button className="button button-primary button-small" disabled={verificationBusy} onClick={() => void confirmVerification()}>{verificationBusy ? 'Consultando…' : 'Ya verifiqué mi correo'}</button></div>}{verificationMessage && <p className="verification-message" role="status">{verificationMessage}</p>}<div className="settings-info-line"><span className="privacy-symbol"><Cloud size={16} /></span><span><strong>{firebaseConfigured ? 'Firebase configurado' : 'Firebase pendiente de configuración'}</strong><small>{firebaseConfigured ? 'Autenticación y datos de catálogo usan el proyecto configurado.' : 'Completa las variables VITE_FIREBASE para habilitar la conexión.'}</small></span></div><div className="settings-info-line"><span className="privacy-symbol"><BookOpen size={16} /></span><span><strong>PDF de Google Drive por enlace</strong><small>Los enlaces habilitados para cualquier persona no son privados. No se usa Drive API ni almacenamiento automático.</small></span></div></section></div></div></div>;
}
function SettingToggle({ title, note, active: initial }: { title: string; note: string; active: boolean }) { const [active, setActive] = useState(initial); return <div className="settings-row"><div><strong>{title}</strong><small>{note}</small></div><button className={`status-toggle${active ? ' active' : ''}`} role="switch" aria-checked={active} aria-label={title} onClick={() => setActive((value) => !value)}><i /></button></div>; }
