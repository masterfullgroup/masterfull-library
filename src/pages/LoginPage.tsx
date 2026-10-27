import { useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, UserRound } from 'lucide-react';
import Brand from '../components/Brand';

export default function LoginPage({ onSignIn, onRegister, onResetPassword, authError, firebaseConfigured, onClearError }: { onSignIn: (email: string, password: string) => Promise<void>; onRegister: (name: string, email: string, password: string) => Promise<void>; onResetPassword: (email: string) => Promise<void>; authError: string; firebaseConfigured: boolean; onClearError: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password) {
      return;
    }
    if (!firebaseConfigured) {
      return;
    }
    setLoading(true);
    setSuccessMessage('');
    try {
      if (mode === 'register') {
        if (name.trim().length < 2) { setSuccessMessage('Escribe tu nombre completo.'); return; }
        if (password !== confirmPassword) { setSuccessMessage('Las contraseñas no coinciden.'); return; }
        if (password.length < 6) { setSuccessMessage('La contraseña debe tener al menos 6 caracteres.'); return; }
        await onRegister(name, email.trim(), password);
        setSuccessMessage('Solicitud enviada. Verifica tu correo; el administrador revisará tu acceso.');
      } else await onSignIn(email.trim(), password);
    } catch { /* AuthContext exposes a safe, user-facing message. */ }
    finally { setLoading(false); }
  }
  async function resetPassword() {
    if (!email.trim()) { setResetMessage('Escribe tu correo electrónico para recibir el enlace de recuperación.'); return; }
    setResetLoading(true);
    setResetMessage('');
    try { await onResetPassword(email.trim()); setResetMessage('Si existe una cuenta con ese correo, Firebase enviará un enlace para restablecer la contraseña.'); }
    catch { /* AuthContext shows the safe error message. */ }
    finally { setResetLoading(false); }
  }

  return (
    <div className="login-screen">
      <header className="login-header"><Brand /></header>
      <main className="login-main">
        <section className="login-panel" aria-labelledby="login-title"><h2 id="login-title">{mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</h2>
          <div className="login-mode-tabs"><button type="button" aria-pressed={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setSuccessMessage(''); onClearError(); }}>Iniciar sesión</button><button type="button" aria-pressed={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setSuccessMessage(''); onClearError(); }}>Crear cuenta</button></div>
          <form className="login-form" onSubmit={submit} noValidate>
            {mode === 'register' && <><label htmlFor="register-name">Nombre</label><div className="field-wrap"><UserRound size={17} /><input id="register-name" autoComplete="name" maxLength={100} placeholder="Tu nombre" value={name} onChange={(event) => setName(event.target.value)} required /></div></>}
            <label htmlFor="email">Correo electrónico</label><div className="field-wrap"><Mail size={17} /><input id="email" type="email" autoComplete="username" placeholder="nombre@correo.com" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
            <label htmlFor="password">Contraseña</label><div className="field-wrap"><LockKeyhole size={17} /><input id="password" type={visible ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="••••••••••••" value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" className="field-action" aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setVisible((value) => !value)}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
            {mode === 'register' && <><label htmlFor="confirm-password">Confirmar contraseña</label><div className="field-wrap"><LockKeyhole size={17} /><input id="confirm-password" type={visible ? 'text' : 'password'} autoComplete="new-password" placeholder="Repite tu contraseña" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></div></>}
            {authError && <div className="auth-error" role="alert">{authError}<button type="button" aria-label="Cerrar mensaje" onClick={onClearError}>×</button></div>}
            {successMessage && <p className="auth-reset-message" role="status">{successMessage}</p>}
            {mode === 'login' && <button type="button" className="forgot-link" disabled={!firebaseConfigured || resetLoading} onClick={() => void resetPassword()}>{resetLoading ? 'Enviando…' : '¿Olvidaste tu contraseña?'}</button>}
            {resetMessage && <p className="auth-reset-message" role="status">{resetMessage}</p>}
            <button type="submit" className="button button-primary login-submit" disabled={loading || !firebaseConfigured || (mode === 'register' && !name.trim())}>{loading ? <><span className="button-spinner" />Procesando…</> : <>{mode === 'login' ? 'Entrar a mi biblioteca' : 'Enviar solicitud'}<ArrowRight size={17} /></>}</button>
          </form>
          {!firebaseConfigured && <p className="login-config-message">Falta configurar Firebase para habilitar el acceso.</p>}
        </section>
      </main>
      <footer className="login-footer"><span>© 2026 MASTERFULL LIBRARY</span></footer>
    </div>
  );
}
