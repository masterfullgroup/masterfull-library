import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Activity, Compass, FolderKanban, Heart, History, LayoutGrid, LogOut, PanelLeft, PanelLeftClose, Search, Settings, ShieldCheck, X } from 'lucide-react';
import Brand from './Brand';
import { useLibrary } from '../context/LibraryContext';

const navigation = [
  { label: 'Inicio', to: '/', icon: Compass, group: 'Biblioteca' },
  { label: 'Catálogo', to: '/catalog', icon: LayoutGrid, group: 'Biblioteca' },
  { label: 'Categorías', to: '/categories', icon: FolderKanban, group: 'Biblioteca' },
  { label: 'Favoritos', to: '/favorites', icon: Heart, group: 'Mi espacio' },
  { label: 'Historial', to: '/history', icon: History, group: 'Mi espacio' },
];

export default function AppShell({ onSignOut, userName, isAdmin, children }: { onSignOut: () => void; userName: string; isAdmin: boolean; children?: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchText, setSearchText] = useState(new URLSearchParams(useLocation().search).get('q') ?? '');
  const { favorites } = useLibrary();
  const navigate = useNavigate();
  const location = useLocation();
  const activeLabel = navigation.find((item) => item.to.split('#')[0] === location.pathname)?.label;
  const title = activeLabel ?? ({ '/admin': 'Administración', '/settings': 'Configuración' }[location.pathname] ?? 'Biblioteca');
  const isCatalogSearchPage = location.pathname === '/catalog' || location.pathname === '/admin';

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setMobileOpen(false);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);

  function toggleNavigation() {
    if (window.matchMedia('(max-width: 850px)').matches) setMobileOpen((open) => !open);
    else setSidebarCollapsed((collapsed) => !collapsed);
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    navigate(`/catalog${searchText.trim() ? `?q=${encodeURIComponent(searchText.trim())}` : ''}`);
    setMobileOpen(false);
  }

  return (
    <div className="app-frame">
      <a href="#main-content" className="skip-link">Saltar al contenido</a>
      {mobileOpen && <button className="mobile-scrim" aria-label="Cerrar menú" onClick={() => setMobileOpen(false)} />}
      <aside id="primary-navigation" className={`sidebar${mobileOpen ? ' sidebar--open' : ''}${sidebarCollapsed ? ' sidebar--compact' : ''}`} aria-label="Navegación principal">
        <div className="sidebar-brand"><Brand />{mobileOpen && <button className="icon-button sidebar-close" aria-label="Cerrar menú" onClick={() => setMobileOpen(false)}><X size={19} /></button>}</div>
        {['Biblioteca', 'Mi espacio'].map((group) => <nav className="nav-group" aria-label={group} key={group}><span className="nav-group-label">{group}</span>{navigation.filter((item) => item.group === group).map(({ label, to, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} title={sidebarCollapsed ? label : undefined} className={({ isActive }) => { const continueLink = to.includes('#'); const selected = continueLink ? isActive && location.hash === '#continue-reading' : isActive && !(location.pathname === '/history' && location.hash === '#continue-reading'); return `nav-link${selected ? ' active' : ''}`; }} onClick={() => setMobileOpen(false)}><Icon size={18} strokeWidth={1.8} /><span>{label}</span>{label === 'Favoritos' && favorites.length > 0 && <span className="nav-count" aria-label={`${favorites.length} favoritos`}>{favorites.length}</span>}</NavLink>)}</nav>)}
        <div className="sidebar-divider" />
        <nav className="nav-group" aria-label="Gestión">{isAdmin && <><span className="nav-group-label">Gestión</span><NavLink to="/admin" title={sidebarCollapsed ? 'Administración' : undefined} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} onClick={() => setMobileOpen(false)}><ShieldCheck size={18} strokeWidth={1.8} /><span>Administración</span></NavLink></>}<NavLink to="/settings" title={sidebarCollapsed ? 'Configuración' : undefined} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} onClick={() => setMobileOpen(false)}><Settings size={18} strokeWidth={1.8} /><span>Configuración</span></NavLink></nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-profile-wrap">
          <div className="sidebar-profile"><span className="avatar">{userName.slice(0, 2).toUpperCase()}</span><span className="profile-copy"><strong>{userName}</strong><small>{isAdmin ? 'Administrador' : 'Usuario'}</small></span></div>
          <button type="button" className="profile-action sidebar-signout" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={onSignOut}><LogOut size={16} /><span>Cerrar sesión</span></button>
        </div>
      </aside>
      <div className={`workspace${sidebarCollapsed ? ' workspace--sidebar-compact' : ''}`}>
        <header className="topbar">
          <div className="topbar-leading"><button className="icon-button sidebar-toggle" aria-label={mobileOpen ? 'Cerrar navegación' : sidebarCollapsed ? 'Expandir navegación' : 'Contraer navegación'} aria-expanded={mobileOpen || !sidebarCollapsed} aria-controls="primary-navigation" onClick={toggleNavigation}>{mobileOpen ? <X size={19} /> : sidebarCollapsed ? <PanelLeft size={19} /> : <PanelLeftClose size={19} />}</button><span className="breadcrumb-root">Biblioteca</span><span className="breadcrumb-slash">/</span><span className="breadcrumb-current">{title}</span></div>
          {!isCatalogSearchPage && <form className="top-search" role="search" onSubmit={submitSearch}><Search size={16} /><label className="sr-only" htmlFor="global-search">Buscar libros</label><input id="global-search" placeholder="Buscar libros por título, autor o categoría" value={searchText} onChange={(event) => setSearchText(event.target.value)} /><kbd>↵</kbd></form>}
          <div className="topbar-actions" aria-hidden="true" />
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}>{children ?? <Outlet />}</main>
        <footer className="app-footer"><span>MASTERFULL LIBRARY <span className="footer-separator">/</span> 2026</span><span className="footer-demo-mark"><Activity size={13} /> Biblioteca privada</span></footer>
      </div>
    </div>
  );
}
