import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const email = process.argv[2]?.trim().toLowerCase();
const projectId = process.env.FIREBASE_PROJECT_ID;
if (!email || !projectId) throw new Error('Uso: FIREBASE_PROJECT_ID=... npm run admin:grant -- correo@dominio.com');
initializeApp({ credential: applicationDefault(), projectId });
const auth = getAuth();
const user = await auth.getUserByEmail(email);
if (typeof user.uid !== 'string' || user.uid.length === 0 || user.uid.length > 128) {
  throw new Error('Firebase devolvió un UID inválido; no se asignaron permisos.');
}
if (user.email?.trim().toLowerCase() !== email) {
  throw new Error('El UID obtenido no corresponde al correo solicitado; no se asignaron permisos.');
}
if (user.disabled) throw new Error('La cuenta está desactivada; no se asignaron permisos de administrador.');
if (!user.emailVerified) throw new Error('Verifica el correo de la cuenta antes de otorgar permisos de administrador.');
const profileRef = getFirestore().collection('usuarios').doc(user.uid);
const profile = await profileRef.get();
if (!profile.exists || profile.data()?.activo !== true || (profile.data()?.uid && profile.data().uid !== user.uid)) {
  throw new Error('El perfil activo no coincide con el UID de Firebase Authentication; no se asignaron permisos.');
}
await profileRef.set({ uid: user.uid, nombre: user.displayName ?? '', correo: user.email, rol: FieldValue.delete(), activo: true }, { merge: true });
await auth.setCustomUserClaims(user.uid, { ...user.customClaims, admin: true });
console.log(`Permiso admin asignado a ${email}. Cierra sesión y vuelve a entrar para refrescar el token.`);
