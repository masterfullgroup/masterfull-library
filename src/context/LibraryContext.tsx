import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { addDoc, collection, deleteDoc, doc, getDocs, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { firebaseAuth } from '../firebase/client';
import { firestore } from '../firebase/client';
import { useAuth } from './AuthContext';
import type { Book, LibraryCategory } from '../models/book';
import { resolveCoverImageUrl } from '../services/books/coverImage.mjs';

interface LibraryState {
  books: Book[];
  categories: LibraryCategory[];
  favorites: string[];
  recentBooks: Array<{ id: string; viewedAt: string }>;
  loading: boolean;
  error: string;
  toggleFavorite: (bookId: string) => Promise<void>;
  recordViewed: (bookId: string, page?: number) => Promise<void>;
  addCategory: (name: string, parentId?: string | null) => Promise<void>;
  updateCategory: (id: string, name: string) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  toggleCategory: (id: string) => Promise<void>;
  saveBook: (book: Partial<Book> & Pick<Book, 'title' | 'authors' | 'language' | 'category' | 'description' | 'format'>) => Promise<void>;
  archiveBook: (id: string) => Promise<void>;
  deleteBook: (id: string) => Promise<void>;
  setBookActive: (id: string, active: boolean) => Promise<void>;
  updateConfirmedBookCovers: (updates: Array<{ id: string; coverUrl: string; expectedCoverUrl: string; replaceExisting: boolean }>) => Promise<void>;
}

type CoverUpdateTransaction = {
  get: (reference: unknown) => Promise<{ exists: () => boolean; data: () => Record<string, any> }>;
  update: (reference: unknown, data: Record<string, unknown>) => unknown;
};

const LibraryContext = createContext<LibraryState | null>(null);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [bookRows, setBookRows] = useState<Array<{ id: string; data: Record<string, any> }>>([]);
  const [categories, setCategories] = useState<LibraryCategory[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recentBooks, setRecentBooks] = useState<Array<{ id: string; viewedAt: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { isAdmin } = useAuth();
  const user = firebaseAuth?.currentUser;
  const books = useMemo<Book[]>(() => bookRows.map(({ id, data }) => {
    const category = categories.find((entry) => entry.id === data.categoriaId);
    const subcategory = categories.find((entry) => entry.id === data.categoriaSubId);
    const createdAt = data.fechaCreacion?.toDate?.() ?? (data.fechaCreacion ? new Date(data.fechaCreacion) : null);
    const addedAt = createdAt instanceof Date && Number.isFinite(createdAt.getTime()) ? createdAt.toISOString() : '';
    return { id, title: data.titulo ?? '', subtitle: data.subtitulo ?? '', authors: Array.isArray(data.autores) ? data.autores : [], publisher: data.editorial ?? '', year: data.anio ?? undefined, edition: data.edicion ?? '', isbn: String(data.isbn ?? ''), language: data.idioma ?? 'Español', category: category?.name ?? '', categoryId: data.categoriaId ?? '', subcategory: subcategory?.name ?? '', subcategoryId: data.categoriaSubId ?? '', description: data.descripcion ?? '', pages: data.paginas ?? undefined, format: data.formato === 'EPUB' ? 'EPUB' : 'PDF', sizeLabel: '', addedAt, cover: 'grid', accent: '#49616b', demo: false, tags: Array.isArray(data.etiquetas) ? data.etiquetas : [], coverUrl: resolveCoverImageUrl(data.portada, data.driveUrl ?? data.archivoReferencia ?? ''), sourceCoverUrl: typeof data.portada === 'string' ? data.portada : '', fileProvider: data.archivoProveedor ?? '', fileReference: data.driveUrl ?? data.archivoReferencia ?? '', driveFileId: data.driveFileId ?? '', driveUrl: data.driveUrl ?? '', active: data.activo !== false } as Book;
  }), [bookRows, categories]);

  useEffect(() => {
    if (!firestore || !user) { setBookRows([]); setCategories([]); setFavorites([]); setRecentBooks([]); setLoading(false); return; }
    setLoading(true);
    const fail = () => { setError('No se pudieron cargar los datos de Firestore. Revisa las reglas y la conexión.'); setLoading(false); };
    const bookQuery = isAdmin ? query(collection(firestore, 'libros'), limit(500)) : query(collection(firestore, 'libros'), where('activo', '==', true), limit(500));
    const categoryQuery = isAdmin ? query(collection(firestore, 'categorias'), limit(500)) : query(collection(firestore, 'categorias'), where('activa', '==', true), limit(500));
    const unsubBooks = onSnapshot(bookQuery, (snapshot: any) => {
      setBookRows(snapshot.docs.map((item: any) => ({ id: item.id, data: item.data() }))); setLoading(false); setError('');
    }, fail);
    const unsubCategories = onSnapshot(categoryQuery, (snapshot: any) => setCategories(snapshot.docs.map((item: any) => ({ id: item.id, name: item.data().nombre ?? '', description: item.data().descripcion ?? '', icon: 'book', active: item.data().activa !== false, parentId: item.data().categoriaPadreId ?? null }))), fail);
    const unsubFavorites = onSnapshot(collection(firestore, 'usuarios', user.uid, 'favoritos'), (snapshot: any) => setFavorites(snapshot.docs.map((item: any) => item.id)), fail);
    const unsubHistory = onSnapshot(query(collection(firestore, 'usuarios', user.uid, 'historial'), orderBy('fechaLectura', 'desc'), limit(50)), (snapshot: any) => setRecentBooks(snapshot.docs.map((item: any) => ({ id: item.id, viewedAt: item.data().fechaLectura?.toDate?.().toISOString?.() ?? '' }))), fail);
    return () => { unsubBooks(); unsubCategories(); unsubFavorites(); unsubHistory(); };
  }, [user?.uid, isAdmin]);

  const value = useMemo<LibraryState>(() => ({ books, categories, favorites, recentBooks, loading, error,
    async toggleFavorite(bookId) {
      if (!firestore || !user) throw new Error('Inicia sesión para guardar favoritos.');
      const ref = doc(firestore, 'usuarios', user.uid, 'favoritos', bookId);
      if (favorites.includes(bookId)) await import('firebase/firestore').then(({ deleteDoc }) => deleteDoc(ref));
      else await setDoc(ref, { libroId: bookId, fechaCreacion: serverTimestamp() });
    },
    async recordViewed(bookId) {
      if (!firestore || !user) return;
      await setDoc(doc(firestore, 'usuarios', user.uid, 'historial', bookId), { libroId: bookId, fechaLectura: serverTimestamp() }, { merge: true });
    },
    async addCategory(name, parentId = null) {
      if (!firestore || !user) throw new Error('Firebase no está configurado.');
      if (name.trim().length < 2 || name.trim().length > 80) throw new Error('El nombre debe tener entre 2 y 80 caracteres.');
      if (categories.some((item) => item.name.trim().toLocaleLowerCase('es') === name.trim().toLocaleLowerCase('es') && (item.parentId ?? null) === parentId)) throw new Error('Ya existe una categoría con ese nombre en esta sección.');
      await addDoc(collection(firestore, 'categorias'), { nombre: name.trim(), descripcion: '', categoriaPadreId: parentId, orden: categories.length, activa: true, fechaCreacion: serverTimestamp() });
    },
    async updateCategory(id, name) {
      if (!firestore) throw new Error('Firebase no está configurado.');
      const category = categories.find((item) => item.id === id);
      if (!category) throw new Error('No encontramos la categoría que quieres editar.');
      const normalized = name.trim();
      if (normalized.length < 2 || normalized.length > 80) throw new Error('El nombre debe tener entre 2 y 80 caracteres.');
      if (categories.some((item) => item.id !== id && item.name.trim().toLocaleLowerCase('es') === normalized.toLocaleLowerCase('es') && (item.parentId ?? null) === (category.parentId ?? null))) throw new Error('Ya existe una categoría con ese nombre en esta sección.');
      await updateDoc(doc(firestore, 'categorias', id), { nombre: normalized, fechaActualizacion: serverTimestamp() });
    },
    async deleteCategory(id) {
      if (!firestore) throw new Error('Firebase no está configurado.');
      const [mainBooks, subcategoryBooks, childCategories] = await Promise.all([
        getDocs(query(collection(firestore, 'libros'), where('categoriaId', '==', id))),
        getDocs(query(collection(firestore, 'libros'), where('categoriaSubId', '==', id))),
        getDocs(query(collection(firestore, 'categorias'), where('categoriaPadreId', '==', id))),
      ]);
      if (!mainBooks.empty || !subcategoryBooks.empty || !childCategories.empty) {
        throw new Error('No se puede eliminar: primero reasigna los libros y elimina o reasigna sus subcategorías.');
      }
      await deleteDoc(doc(firestore, 'categorias', id));
    },
    async toggleCategory(id) { if (!firestore) return; const category = categories.find((item) => item.id === id); if (category) await updateDoc(doc(firestore, 'categorias', id), { activa: !category.active, fechaActualizacion: serverTimestamp() }); },
    async saveBook(book) {
      if (!firestore || !user) throw new Error('Firebase no está configurado.');
      if (book.isbn && books.some((item) => item.isbn === book.isbn && item.id !== book.id)) throw new Error('Ya existe un libro con ese ISBN.');
      const fields = { titulo: book.title.trim(), autores: book.authors.map((author) => author.trim()).filter(Boolean), editorial: book.publisher?.trim() ?? '', anio: book.year ?? null, isbn: book.isbn?.trim() ?? '', descripcion: book.description.trim(), categoriaId: book.categoryId ?? null, categoriaSubId: book.subcategoryId ?? null, idioma: book.language, formato: book.format, etiquetas: book.tags ?? [], portada: book.coverUrl ?? '', archivoProveedor: book.driveFileId ? 'google_drive' : '', archivoReferencia: book.driveUrl ?? book.fileReference?.trim() ?? '', driveFileId: book.driveFileId ?? '', driveUrl: book.driveUrl ?? '', fechaActualizacion: serverTimestamp(), activo: book.active ?? true };
      if (book.id) await updateDoc(doc(firestore, 'libros', book.id), fields);
      else await addDoc(collection(firestore, 'libros'), { ...fields, fechaCreacion: serverTimestamp() });
    },
    async archiveBook(id) { if (!firestore) throw new Error('Firebase no está configurado.'); await updateDoc(doc(firestore, 'libros', id), { activo: false, fechaActualizacion: serverTimestamp() }); },
    async deleteBook(id) { if (!firestore) throw new Error('Firebase no está configurado.'); await deleteDoc(doc(firestore, 'libros', id)); },
    async setBookActive(id, active) { if (!firestore) throw new Error('Firebase no está configurado.'); await updateDoc(doc(firestore, 'libros', id), { activo: active, fechaActualizacion: serverTimestamp() }); },
    async updateConfirmedBookCovers(updates) {
      if (!firestore || !user) throw new Error('Firebase no está configurado.');
      if (!updates.length || updates.length > 100 || new Set(updates.map((entry) => entry.id)).size !== updates.length) throw new Error('La lista de portadas confirmadas no es válida.');
      await runTransaction(firestore, async (transaction: CoverUpdateTransaction) => {
        const rows = await Promise.all(updates.map((entry) => transaction.get(doc(firestore, 'libros', entry.id))));
        rows.forEach((snapshot, index) => {
          const update = updates[index];
          if (!snapshot.exists()) throw new Error('Un libro confirmado ya no existe. Actualiza la lista e inténtalo de nuevo.');
          const current = typeof snapshot.data().portada === 'string' ? snapshot.data().portada : '';
          if (current !== update.expectedCoverUrl) throw new Error('La portada del libro cambió durante la confirmación. Revisa el libro antes de volver a guardar.');
          if (current && !update.replaceExisting) throw new Error('Confirma expresamente el reemplazo de cada portada manual existente.');
        });
        updates.forEach((entry) => transaction.update(doc(firestore, 'libros', entry.id), { portada: entry.coverUrl, fechaActualizacion: serverTimestamp() }));
      });
    },
  }), [books, categories, favorites, recentBooks, loading, error, user?.uid]);

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const context = useContext(LibraryContext);
  if (!context) throw new Error('useLibrary debe usarse dentro de LibraryProvider');
  return context;
}
