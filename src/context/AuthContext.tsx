import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { browserLocalPersistence, createUserWithEmailAndPassword, onIdTokenChanged, sendEmailVerification, sendPasswordResetEmail, setPersistence, signInWithEmailAndPassword, signOut, updateProfile, type User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { firebaseAuth, firestore } from '../firebase/client';

interface AuthState {
  user: User | null;
  isAdmin: boolean;
  accessStatus: 'approved' | 'pending' | 'rejected' | 'suspended' | 'request-missing';
  emailVerified: boolean;
  loading: boolean;
  error: string;
  signIn: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  refreshAccess: () => Promise<boolean>;
  resetPassword: (email: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

function friendlyAuthError(code: string) {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password': return 'El correo o la contraseña no son correctos.';
    case 'auth/too-many-requests': return 'Se bloquearon temporalmente los intentos. Espera unos minutos y vuelve a probar.';
    case 'auth/network-request-failed': return 'No pudimos conectar con Firebase. Revisa tu conexión.';
    case 'auth/user-disabled': return 'Esta cuenta está desactivada. Contacta al administrador.';
    case 'auth/operation-not-allowed': return 'Firebase aún no tiene habilitado el acceso por correo y contraseña.';
    case 'auth/invalid-api-key': return 'La configuración de Firebase es inválida. Revisa las variables de entorno.';
    case 'auth/invalid-email': return 'Escribe un correo electrónico válido.';
    case 'auth/email-already-in-use': return 'Ya existe una cuenta con ese correo. Inicia sesión o restablece la contraseña.';
    case 'auth/weak-password': return 'Elige una contraseña de al menos 6 caracteres.';
    default: return 'No pudimos iniciar sesión. Revisa tus datos y la configuración de Firebase.';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [accessStatus, setAccessStatus] = useState<AuthState['accessStatus']>('request-missing');
  const [emailVerified, setEmailVerified] = useState(false);
  const [loading, setLoading] = useState(Boolean(firebaseAuth));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!firebaseAuth) return;
    return onIdTokenChanged(firebaseAuth, async (nextUser: User | null) => {
      setUser(null);
      setIsAdmin(false);
      setAccessStatus('request-missing');
      setEmailVerified(false);
      if (nextUser) {
        try {
          const token = await nextUser.getIdTokenResult();
          if (!firestore) throw new Error('FIRESTORE_UNAVAILABLE');
          const profile = await getDoc(doc(firestore, 'usuarios', nextUser.uid));
          setUser(nextUser);
          setEmailVerified(token.claims.email_verified === true);
          if (profile.exists() && profile.data()?.activo === true) {
            setAccessStatus(profile.data()?.estadoCuenta === 'suspendido' ? 'suspended' : 'approved');
            setIsAdmin(token.claims.admin === true);
          } else {
            const request = await getDoc(doc(firestore, 'solicitudesAcceso', nextUser.uid));
            setAccessStatus(request.exists() ? request.data()?.estado ?? 'pending' : 'request-missing');
          }
        } catch {
          setError('No pudimos verificar los permisos de esta cuenta. Vuelve a iniciar sesión.');
          await signOut(firebaseAuth);
        }
      }
      setLoading(false);
    }, () => {
      setUser(null);
      setIsAdmin(false);
      setError('No pudimos verificar la sesión. Actualiza la página e inténtalo de nuevo.');
      setLoading(false);
    });
  }, []);

  const value = useMemo<AuthState>(() => ({
    user,
    isAdmin,
    accessStatus,
    emailVerified,
    loading,
    error,
    clearError: () => setError(''),
    async signIn(email, password) {
      setError('');
      if (!firebaseAuth) {
        setError('La plataforma requiere configurar Firebase antes de aceptar accesos.');
        return;
      }
      try {
        await setPersistence(firebaseAuth, browserLocalPersistence);
        await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
      } catch (reason) {
        const code = typeof reason === 'object' && reason && 'code' in reason ? String(reason.code) : '';
        setError(friendlyAuthError(code));
        throw reason;
      }
    },
    async register(name, email, password) {
      setError('');
      if (!firebaseAuth || !firestore) throw new Error('Firebase no está configurado.');
      try {
        await setPersistence(firebaseAuth, browserLocalPersistence);
        const credential = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
        await updateProfile(credential.user, { displayName: name.trim() });
        await setDoc(doc(firestore, 'solicitudesAcceso', credential.user.uid), {
          uid: credential.user.uid,
          nombre: name.trim(),
          correo: credential.user.email,
          estado: 'pending',
          correoVerificado: false,
          verificadoEn: null,
          createdAt: serverTimestamp(),
        });
        await sendEmailVerification(credential.user);
      } catch (reason) {
        const code = typeof reason === 'object' && reason && 'code' in reason ? String(reason.code) : '';
        setError(friendlyAuthError(code));
        throw reason;
      }
    },
    async resendVerification() {
      if (firebaseAuth?.currentUser && !firebaseAuth.currentUser.emailVerified) await sendEmailVerification(firebaseAuth.currentUser);
    },
    async refreshAccess() {
      const current = firebaseAuth?.currentUser;
      if (!current || !firestore) return false;
      await current.reload();
      const token = await current.getIdTokenResult(true);
      const verified = token.claims.email_verified === true;
      const profile = await getDoc(doc(firestore, 'usuarios', current.uid));
      setEmailVerified(verified);
      if (profile.exists() && profile.data()?.activo === true) {
        setAccessStatus(profile.data()?.estadoCuenta === 'suspendido' ? 'suspended' : 'approved');
        setIsAdmin((await current.getIdTokenResult()).claims.admin === true);
      } else {
        const request = await getDoc(doc(firestore, 'solicitudesAcceso', current.uid));
        setAccessStatus(request.exists() ? request.data()?.estado ?? 'pending' : 'request-missing');
        if (request.exists() && verified && request.data()?.correoVerificado !== true) {
          await updateDoc(doc(firestore, 'solicitudesAcceso', current.uid), {
            correoVerificado: true,
            verificadoEn: serverTimestamp(),
          });
        }
      }
      return verified;
    },
    async resetPassword(email) {
      setError('');
      if (!firebaseAuth) {
        setError('La plataforma requiere configurar Firebase antes de recuperar el acceso.');
        return;
      }
      try {
        await sendPasswordResetEmail(firebaseAuth, email.trim());
      } catch (reason) {
        const code = typeof reason === 'object' && reason && 'code' in reason ? String(reason.code) : '';
        setError(friendlyAuthError(code));
        throw reason;
      }
    },
    async signOutUser() {
      if (firebaseAuth) await signOut(firebaseAuth);
    },
  }), [user, isAdmin, accessStatus, emailVerified, loading, error]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const state = useContext(AuthContext);
  if (!state) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return state;
}
