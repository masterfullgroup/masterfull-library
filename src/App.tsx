import { lazy, Suspense, useCallback, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { CircleCheck, Info, TriangleAlert, X, MailCheck, RefreshCw, LogOut } from 'lucide-react';
import AppShell from './components/AppShell';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastContext, type ToastKind } from './context/ToastContext';
import { LibraryProvider } from './context/LibraryContext';
import { firebaseConfigured } from './firebase/client';
import LoginPage from './pages/LoginPage';
import { AdminPage, BookDetailPage, CatalogPage, CategoriesPage, FavoritesPage, HistoryPage, HomePage, SettingsPage } from './pages/LibraryPages';

const ReaderPage = lazy(() => import('./pages/ReaderPage'));
interface ToastItem { id: number; message: string; kind: ToastKind }

function AuthenticatedRoute({ authenticated, children }: { authenticated: boolean; children: ReactNode }) {
  return authenticated ? children : <Navigate to="/login" replace />;
}

function LoginRoute() {
  const navigate = useNavigate();
  const { user, accessStatus, signIn, register, resetPassword, error, clearError } = useAuth();
  if (user) return <Navigate to={accessStatus === 'approved' ? '/' : '/access'} replace />;
  return <LoginPage firebaseConfigured={firebaseConfigured} authError={error} onClearError={clearError} onResetPassword={resetPassword} onSignIn={async (email, password) => { await signIn(email, password); navigate('/', { replace: true }); }} onRegister={async (name, email, password) => { await register(name, email, password); navigate('/access', { replace: true }); }} />;
}

function AccessRoute() {
  const { user, accessStatus, emailVerified, loading, resendVerification, refreshAccess, signOutUser } = useAuth();
  const [message, setMessage] = useState('');
  if (loading) return <div className="reader-loading reader-loading--full"><strong>Verificando tu solicitud…</strong></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (accessStatus === 'approved') return <Navigate to="/" replace />;
  const headings = {
    pending: ['Pendiente de aprobación', 'Tu solicitud está en revisión por el administrador.'],
    rejected: ['Solicitud rechazada', 'El administrador rechazó esta solicitud. Contacta al responsable si necesitas más información.'],
    suspended: ['Cuenta suspendida', 'Tu acceso a la biblioteca está suspendido. Contacta al administrador.'],
    'request-missing': ['Solicitud incompleta', 'No encontramos una solicitud para esta cuenta. Cierra sesión y vuelve a crearla o contacta al administrador.'],
    approved: ['Acceso aprobado', ''],
  } as const;
  const [title, description] = headings[accessStatus];
  return <div className="login-screen"><header className="login-header"><strong>MASTERFULL LIBRARY</strong></header><main className="login-main"><section className="login-panel access-status-panel"><MailCheck size={32} /><h2>{title}</h2><p>{description}</p><div className="access-status-email">{user.email}</div><span className={`access-request-verified${emailVerified ? ' is-verified' : ''}`}>{emailVerified ? 'Correo verificado' : 'Correo sin verificar'}</span>{!emailVerified && <p>Verifica el enlace enviado para que el administrador pueda aprobar tu solicitud.</p>}<div className="access-status-actions">{!emailVerified && <button className="button button-secondary" onClick={async () => { try { await resendVerification(); setMessage('Enviamos otro correo de verificación.'); } catch { setMessage('No pudimos enviar el correo. Vuelve a intentarlo más tarde.'); } }}>{message ? 'Correo enviado' : 'Reenviar verificación'}</button>}<button className="button button-secondary" onClick={async () => { try { await refreshAccess(); setMessage('Estado actualizado.'); } catch { setMessage('No pudimos actualizar el estado. Comprueba tu conexión.'); } }}><RefreshCw size={16} />Actualizar estado</button><button className="button button-quiet" onClick={() => void signOutUser()}><LogOut size={16} />Cerrar sesión</button></div>{message && <p role="status">{message}</p>}</section></main></div>;
}

function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  return isAdmin ? children : <section className="page access-denied"><h1>Acceso restringido</h1><p>Esta cuenta no tiene permisos de administración.</p></section>;
}

function AuthenticatedApp() {
  const { user, isAdmin, accessStatus, loading, signOutUser } = useAuth();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const showToast = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current.slice(-2), { id, message, kind }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4800);
  }, []);
  if (loading) return <div className="reader-loading reader-loading--full"><strong>Verificando tu sesión…</strong></div>;
  const authenticated = Boolean(user);
  return <LibraryProvider><ToastContext.Provider value={showToast}><Routes>
    <Route path="/login" element={<LoginRoute />} />
    <Route path="/access" element={<AccessRoute />} />
    <Route element={<AuthenticatedRoute authenticated={authenticated && accessStatus === 'approved'}><AppShell onSignOut={() => void signOutUser()} userName={user?.displayName || user?.email?.split('@')[0] || 'Usuario'} isAdmin={isAdmin} /></AuthenticatedRoute>}>
      <Route index element={<HomePage />} />
      <Route path="catalog" element={<CatalogPage />} />
      <Route path="categories" element={<CategoriesPage />} />
      <Route path="favorites" element={<FavoritesPage />} />
      <Route path="history" element={<HistoryPage />} />
      <Route path="admin" element={<AdminOnly><AdminPage /></AdminOnly>} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="book/:id" element={<BookDetailPage />} />
    </Route>
    <Route path="/reader/:id" element={<AuthenticatedRoute authenticated={authenticated && accessStatus === 'approved'}><Suspense fallback={<div className="reader-loading reader-loading--full"><strong>Abriendo el lector PDF…</strong></div>}><ReaderPage /></Suspense></AuthenticatedRoute>} />
    <Route path="*" element={<Navigate to={authenticated ? accessStatus === 'approved' ? '/' : '/access' : '/login'} replace />} />
  </Routes><ToastViewport toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} /></ToastContext.Provider></LibraryProvider>;
}

export default function App() {
  return <AuthProvider><AuthenticatedApp /></AuthProvider>;
}

function ToastViewport({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  return <div className="toast-viewport" aria-live="polite" aria-relevant="additions">{toasts.map((toast) => { const Icon = toast.kind === 'success' ? CircleCheck : toast.kind === 'warning' ? TriangleAlert : Info; return <div className={`toast toast--${toast.kind}`} key={toast.id}><Icon size={17} /><span>{toast.message}</span><button aria-label="Cerrar notificación" onClick={() => onDismiss(toast.id)}><X size={15} /></button></div>; })}</div>;
}
