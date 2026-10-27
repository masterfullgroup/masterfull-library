import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const email = process.argv[2]?.trim().toLowerCase();
const projectId = process.env.FIREBASE_PROJECT_ID;

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error('Indica el correo a consultar. Ejemplo: npm run admin:check -- usuario@dominio.com');
}
if (!projectId) {
  throw new Error('Define FIREBASE_PROJECT_ID antes de ejecutar la consulta.');
}

try {
  initializeApp({ credential: applicationDefault(), projectId });

  const auth = getAuth();
  const user = await auth.getUserByEmail(email);
  if (typeof user.uid !== 'string' || user.uid.length === 0 || user.uid.length > 128) {
    throw new Error('Firebase devolvió un UID inválido; no se completó la consulta.');
  }
  if (user.email?.trim().toLowerCase() !== email) {
    throw new Error('El correo devuelto por Firebase no coincide con el solicitado.');
  }

  const profileSnapshot = await getFirestore().collection('usuarios').doc(user.uid).get();
  const profile = profileSnapshot.exists ? profileSnapshot.data() : undefined;
  const customClaims = user.customClaims ?? {};

  console.log(JSON.stringify({
    projectId,
    email: user.email,
    uid: user.uid,
    emailVerified: user.emailVerified,
    accountEnabled: !user.disabled,
    customClaims,
    adminClaim: customClaims.admin === true,
    profileExists: profileSnapshot.exists,
    profileActive: profile?.activo === true,
    profileUidMatches: profileSnapshot.exists && (!profile?.uid || profile.uid === user.uid),
    readyForAdminClaim: user.emailVerified
      && !user.disabled
      && profileSnapshot.exists
      && profile?.activo === true
      && (!profile?.uid || profile.uid === user.uid),
  }, null, 2));
} catch (error) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  if (code === 'app/invalid-credential') {
    console.error('No hay credenciales ADC válidas. Configura ADC para Firebase Admin SDK y vuelve a ejecutar admin:check.');
  } else if (code.includes('permission-denied') || code.includes('insufficient-permission')) {
    console.error('Las credenciales no tienen permiso de lectura para Authentication o Firestore en este proyecto.');
  } else if (code === 'auth/user-not-found') {
    console.error('No se encontró una cuenta con ese correo en el proyecto indicado.');
  } else if (error instanceof Error && !code) {
    console.error(error.message);
  } else {
    console.error(`No se pudo completar la consulta de solo lectura${code ? ` (${code})` : ''}.`);
  }
  process.exitCode = 1;
}
