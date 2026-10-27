import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, runTransaction, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

const projectId = 'demo-masterfull-library-rules';
let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const profiles = [
      ['reader', { uid: 'reader', activo: true }],
      ['other', { uid: 'other', activo: true }],
      ['inactive', { uid: 'inactive', activo: false, rol: 'admin' }],
      ['role-only', { uid: 'role-only', activo: true, rol: 'admin' }],
      ['admin', { uid: 'admin', activo: true }],
    ];
    for (const [uid, profile] of profiles) await setDoc(doc(db, 'usuarios', uid), profile);
    await setDoc(doc(db, 'solicitudesAcceso', 'existing-pending'), { uid: 'existing-pending', nombre: 'Pendiente', correo: 'pending@example.com', estado: 'pending', correoVerificado: false, verificadoEn: null, createdAt: new Date() });
    await setDoc(doc(db, 'libros', 'book-active'), { titulo: 'Activo', activo: true });
    await setDoc(doc(db, 'libros', 'book-history-no-page'), { titulo: 'Historial sin página', activo: true });
    await setDoc(doc(db, 'libros', 'book-archived'), { titulo: 'Archivado', activo: false });
    await setDoc(doc(db, 'categorias', 'category-active'), { nombre: 'Activa', activa: true });
    await setDoc(doc(db, 'categorias', 'category-disabled'), { nombre: 'Inactiva', activa: false });
  });
});

after(async () => { await testEnv?.cleanup(); });

function userDb(uid, claims = {}) { return testEnv.authenticatedContext(uid, claims).firestore(); }

test('usuario activo lee libros y categorías activos, pero no archivados', async () => {
  const db = userDb('reader');
  await assertSucceeds(getDoc(doc(db, 'libros', 'book-active')));
  await assertFails(getDoc(doc(db, 'libros', 'book-archived')));
  await assertFails(setDoc(doc(db, 'libros', 'book-user-write'), { titulo: 'No permitido', activo: true }));
  await assertFails(updateDoc(doc(db, 'libros', 'book-active'), { titulo: 'No permitido' }));
  await assertFails(deleteDoc(doc(db, 'libros', 'book-active')));
  await assertSucceeds(getDoc(doc(db, 'categorias', 'category-active')));
  await assertFails(getDoc(doc(db, 'categorias', 'category-disabled')));
  await assertFails(setDoc(doc(db, 'categorias', 'category-user-write'), { nombre: 'No permitida', activa: true }));
  await assertFails(updateDoc(doc(db, 'categorias', 'category-active'), { nombre: 'No permitido' }));
  await assertFails(deleteDoc(doc(db, 'categorias', 'category-active')));
});

test('custom claim admin activo puede gestionar libros y categorías', async () => {
  const db = userDb('admin', { admin: true });
  await assertSucceeds(setDoc(doc(db, 'libros', 'book-new'), { titulo: 'Nuevo', activo: true }));
  await assertSucceeds(updateDoc(doc(db, 'categorias', 'category-active'), { nombre: 'Editada' }));
  await assertSucceeds(getDoc(doc(db, 'libros', 'book-archived')));
});

test('el rol admin de Firestore sin custom claim no concede privilegios', async () => {
  const db = userDb('role-only');
  await assertFails(setDoc(doc(db, 'libros', 'book-forbidden'), { titulo: 'No autorizado', activo: true }));
  await assertFails(setDoc(doc(db, 'categorias', 'category-forbidden'), { nombre: 'No autorizada', activa: true }));
});

test('un custom claim admin no permite acceso si el perfil está inactivo', async () => {
  const db = userDb('inactive', { admin: true });
  await assertFails(getDoc(doc(db, 'libros', 'book-active')));
  await assertFails(setDoc(doc(db, 'libros', 'book-forbidden'), { titulo: 'No autorizado', activo: true }));
});

test('un usuario solo lee su perfil; no puede crear, modificar su rol ni escribir el perfil de otro', async () => {
  const db = userDb('reader');
  await assertSucceeds(getDoc(doc(db, 'usuarios', 'reader')));
  await assertFails(getDoc(doc(db, 'usuarios', 'other')));
  await assertFails(updateDoc(doc(db, 'usuarios', 'reader'), { rol: 'admin', activo: true }));
  await assertFails(setDoc(doc(db, 'usuarios', 'reader'), { uid: 'reader', rol: 'admin', activo: true }));
  await assertFails(deleteDoc(doc(db, 'usuarios', 'reader')));
  await assertFails(updateDoc(doc(db, 'usuarios', 'other'), { activo: false }));
  await assertFails(deleteDoc(doc(db, 'usuarios', 'other')));
});

test('administrador no puede cambiar un perfil activo fuera de su transición emparejada', async () => {
  const db = userDb('admin', { admin: true });
  await assertFails(setDoc(doc(db, 'usuarios', 'managed-user'), { uid: 'managed-user', activo: true }));
  await assertFails(updateDoc(doc(db, 'usuarios', 'reader'), { activo: false }));
  await assertFails(deleteDoc(doc(db, 'usuarios', 'reader')));
});

test('solicitante sin perfil activo puede crear una sola solicitud estrictamente pendiente', async () => {
  const db = userDb('signup-user', { email: 'new@example.com' });
  const requestRef = doc(db, 'solicitudesAcceso', 'signup-user');
  await assertSucceeds(setDoc(requestRef, { uid: 'signup-user', nombre: 'Nueva Persona', correo: 'new@example.com', estado: 'pending', correoVerificado: false, verificadoEn: null, createdAt: serverTimestamp() }));
  await assertSucceeds(getDoc(requestRef));
  await assertFails(getDoc(doc(db, 'libros', 'book-active')));
  await assertFails(getDoc(doc(db, 'categorias', 'category-active')));
  await assertFails(setDoc(doc(db, 'usuarios', 'signup-user', 'favoritos', 'book-active'), { libroId: 'book-active', fechaCreacion: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'usuarios', 'signup-user', 'historial', 'book-active'), { libroId: 'book-active', fechaLectura: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'usuarios', 'signup-user', 'estado', 'lectura'), { ultimoLibroId: 'book-active', ultimaPaginaLeida: 1, fechaUltimaLectura: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'usuarios', 'signup-user'), { uid: 'signup-user', activo: true }));
  await assertFails(updateDoc(requestRef, { estado: 'approved', activo: true, rol: 'admin' }));
  await assertFails(deleteDoc(requestRef));
  await assertFails(setDoc(requestRef, { uid: 'signup-user', nombre: 'Nueva Persona', correo: 'new@example.com', estado: 'approved', correoVerificado: false, verificadoEn: null, createdAt: serverTimestamp() }));
});

test('solo un ID token con email_verified verdadero puede registrar la verificación del correo', async () => {
  const email = 'verified@example.com';
  const requestRef = doc(userDb('verified-applicant', { email, email_verified: false }), 'solicitudesAcceso', 'verified-applicant');
  await assertSucceeds(setDoc(requestRef, { uid: 'verified-applicant', nombre: 'Solicitante Verificado', correo: email, estado: 'pending', correoVerificado: false, verificadoEn: null, createdAt: serverTimestamp() }));
  await assertFails(updateDoc(requestRef, { correoVerificado: true, verificadoEn: serverTimestamp() }));
  const refreshedVerifiedTokenDb = userDb('verified-applicant', { email, email_verified: true });
  await assertSucceeds(updateDoc(doc(refreshedVerifiedTokenDb, 'solicitudesAcceso', 'verified-applicant'), { correoVerificado: true, verificadoEn: serverTimestamp() }));
  await assertFails(updateDoc(doc(refreshedVerifiedTokenDb, 'solicitudesAcceso', 'verified-applicant'), { correo: 'changed@example.com' }));
});

async function createRequest(uid, email) {
  const db = userDb(uid, { email, email_verified: false });
  await setDoc(doc(db, 'solicitudesAcceso', uid), { uid, nombre: `Persona ${uid}`, correo: email, estado: 'pending', correoVerificado: false, verificadoEn: null, createdAt: serverTimestamp() });
  await updateDoc(doc(userDb(uid, { email, email_verified: true }), 'solicitudesAcceso', uid), { correoVerificado: true, verificadoEn: serverTimestamp() });
}

async function approveInTransaction(db, uid) {
  const requestRef = doc(db, 'solicitudesAcceso', uid);
  const profileRef = doc(db, 'usuarios', uid);
  await runTransaction(db, async (transaction) => {
    const request = await transaction.get(requestRef);
    const profile = await transaction.get(profileRef);
    const data = request.data();
    transaction.set(profileRef, { uid, nombre: data.nombre, correo: data.correo, activo: true, estadoCuenta: 'approved', aprobadoPor: 'admin', aprobadoEn: serverTimestamp() });
    transaction.update(requestRef, { estado: 'approved', aprobadoPor: 'admin', aprobadoEn: serverTimestamp() });
    assert.equal(profile.exists(), false);
  });
}

test('aprobación exige admin con claim y perfil activo y actualiza solicitud/perfil atómicamente', async () => {
  const uid = 'atomic-approved';
  await createRequest(uid, 'atomic@example.com');
  const noClaimAdmin = userDb('admin');
  await assertFails(approveInTransaction(noClaimAdmin, uid));
  const inactiveAdmin = userDb('inactive', { admin: true });
  await assertFails(approveInTransaction(inactiveAdmin, uid));
  await assertFails(updateDoc(doc(userDb(uid, { email: 'atomic@example.com', email_verified: true }), 'solicitudesAcceso', uid), { estado: 'approved' }));
  const admin = userDb('admin', { admin: true });
  await approveInTransaction(admin, uid);
  await assertSucceeds(getDoc(doc(userDb(uid), 'usuarios', uid)));
  await assertSucceeds(getDoc(doc(userDb(uid), 'libros', 'book-active')));
  await assertSucceeds(getDocs(collection(admin, 'solicitudesAcceso')));
});

test('transición de perfil sin su solicitud y transición de solicitud sin su perfil se rechazan', async () => {
  const uid = 'atomic-integrity';
  await createRequest(uid, 'integrity@example.com');
  const admin = userDb('admin', { admin: true });
  await assertFails(setDoc(doc(admin, 'usuarios', uid), { uid, nombre: `Persona ${uid}`, correo: 'integrity@example.com', activo: true, estadoCuenta: 'approved', aprobadoPor: 'admin', aprobadoEn: serverTimestamp() }));
  await assertFails(updateDoc(doc(admin, 'solicitudesAcceso', uid), { estado: 'approved', aprobadoPor: 'admin', aprobadoEn: serverTimestamp() }));
  await assertFails(runTransaction(admin, async (transaction) => {
    const requestRef = doc(admin, 'solicitudesAcceso', uid);
    const profileRef = doc(admin, 'usuarios', uid);
    const request = await transaction.get(requestRef);
    transaction.set(profileRef, { uid, nombre: request.data().nombre, correo: request.data().correo, activo: true, estadoCuenta: 'approved', aprobadoPor: 'admin', aprobadoEn: serverTimestamp() });
  }));
  await assertSucceeds(getDoc(doc(userDb(uid, { email: 'integrity@example.com' }), 'solicitudesAcceso', uid)).then((snapshot) => assert.equal(snapshot.data().estado, 'pending')));
  const missingProfile = await getDoc(doc(userDb(uid), 'usuarios', uid));
  assert.equal(missingProfile.exists(), false);
});

test('rechazo no crea perfil; suspensión bloquea el catálogo y reactivación restaura acceso', async () => {
  const rejectedUid = 'rejected-applicant';
  await createRequest(rejectedUid, 'rejected@example.com');
  const admin = userDb('admin', { admin: true });
  await runTransaction(admin, async (transaction) => {
    const requestRef = doc(admin, 'solicitudesAcceso', rejectedUid);
    const request = await transaction.get(requestRef);
    assert.equal(request.data().estado, 'pending');
    transaction.update(requestRef, { estado: 'rejected', rechazadoPor: 'admin', rechazadoEn: serverTimestamp() });
  });
  const rejectedProfile = await getDoc(doc(userDb(rejectedUid), 'usuarios', rejectedUid));
  assert.equal(rejectedProfile.exists(), false);
  await assertFails(getDoc(doc(userDb(rejectedUid), 'libros', 'book-active')));

  const uid = 'suspension-lifecycle';
  const email = 'lifecycle@example.com';
  await createRequest(uid, email);
  await approveInTransaction(admin, uid);
  const activeUserDb = userDb(uid, { email, email_verified: true });
  await assertSucceeds(getDoc(doc(activeUserDb, 'libros', 'book-active')));
  await runTransaction(admin, async (transaction) => {
    const requestRef = doc(admin, 'solicitudesAcceso', uid);
    const profileRef = doc(admin, 'usuarios', uid);
    const request = await transaction.get(requestRef);
    const profile = await transaction.get(profileRef);
    assert.equal(request.data().estado, 'approved');
    assert.equal(profile.data().activo, true);
    transaction.update(profileRef, { activo: false, estadoCuenta: 'suspendido', suspendidoPor: 'admin', suspendidoEn: serverTimestamp() });
    transaction.update(requestRef, { estado: 'suspended', suspendidoPor: 'admin', suspendidoEn: serverTimestamp() });
  });
  await assertFails(getDoc(doc(activeUserDb, 'libros', 'book-active')));
  await assertFails(getDoc(doc(activeUserDb, 'categorias', 'category-active')));
  await runTransaction(admin, async (transaction) => {
    const requestRef = doc(admin, 'solicitudesAcceso', uid);
    const profileRef = doc(admin, 'usuarios', uid);
    const request = await transaction.get(requestRef);
    const profile = await transaction.get(profileRef);
    assert.equal(request.data().estado, 'suspended');
    assert.equal(profile.data().activo, false);
    transaction.update(profileRef, { activo: true, estadoCuenta: 'approved', reactivadoPor: 'admin', reactivadoEn: serverTimestamp() });
    transaction.update(requestRef, { estado: 'approved', reactivadoPor: 'admin', reactivadoEn: serverTimestamp() });
  });
  await assertSucceeds(getDoc(doc(activeUserDb, 'libros', 'book-active')));
});

test('solicitud pendiente no puede falsificar correo, identidad ni campos de privilegio', async () => {
  const db = userDb('signup-other', { email: 'real@example.com' });
  const safeFields = { correoVerificado: false, verificadoEn: null, createdAt: serverTimestamp() };
  await assertFails(setDoc(doc(db, 'solicitudesAcceso', 'signup-other'), { uid: 'another-user', nombre: 'Persona', correo: 'real@example.com', estado: 'pending', ...safeFields }));
  await assertFails(setDoc(doc(db, 'solicitudesAcceso', 'signup-other'), { uid: 'signup-other', nombre: 'Persona', correo: 'forged@example.com', estado: 'pending', ...safeFields }));
  await assertFails(setDoc(doc(db, 'solicitudesAcceso', 'signup-other'), { uid: 'signup-other', nombre: 'Persona', correo: 'real@example.com', estado: 'pending', activo: true, rol: 'admin', ...safeFields }));
});

test('solicitante no puede pedir acceso si ya tiene perfil o una solicitud previa', async () => {
  const existingProfileDb = userDb('reader', { email: 'reader@example.com' });
  await assertFails(setDoc(doc(existingProfileDb, 'solicitudesAcceso', 'reader'), { uid: 'reader', nombre: 'Reader', correo: 'reader@example.com', estado: 'pending', correoVerificado: false, verificadoEn: null, createdAt: serverTimestamp() }));
  const existingRequestDb = userDb('existing-pending', { email: 'pending@example.com' });
  await assertFails(setDoc(doc(existingRequestDb, 'solicitudesAcceso', 'existing-pending'), { uid: 'existing-pending', nombre: 'Pendiente', correo: 'pending@example.com', estado: 'pending', correoVerificado: false, verificadoEn: null, createdAt: serverTimestamp() }));
});

test('solo administrador activo puede leer la bandeja; ningún cliente puede cambiar estados', async () => {
  const admin = userDb('admin', { admin: true });
  const ordinary = userDb('reader');
  await assertSucceeds(getDoc(doc(admin, 'solicitudesAcceso', 'existing-pending')));
  await assertFails(getDoc(doc(ordinary, 'solicitudesAcceso', 'existing-pending')));
  await assertFails(updateDoc(doc(admin, 'solicitudesAcceso', 'existing-pending'), { estado: 'approved' }));
  await assertFails(updateDoc(doc(ordinary, 'solicitudesAcceso', 'existing-pending'), { estado: 'approved' }));
});

test('favoritos solo permite documentos válidos del propietario sobre libros activos', async () => {
  const db = userDb('reader');
  const favorite = doc(db, 'usuarios', 'reader', 'favoritos', 'book-active');
  await assertSucceeds(setDoc(favorite, { libroId: 'book-active', fechaCreacion: serverTimestamp() }));
  await assertSucceeds(getDoc(favorite));
  await assertFails(getDoc(doc(db, 'usuarios', 'other', 'favoritos', 'book-active')));
  await assertSucceeds(deleteDoc(favorite));
  await assertFails(setDoc(doc(db, 'usuarios', 'other', 'favoritos', 'book-active'), { libroId: 'book-active', fechaCreacion: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'usuarios', 'reader', 'favoritos', 'book-archived'), { libroId: 'book-archived', fechaCreacion: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'usuarios', 'reader', 'favoritos', 'book-active'), { libroId: 'book-active', rol: 'admin', fechaCreacion: serverTimestamp() }));
});

test('historial y progreso solo son modificables por el usuario propietario', async () => {
  const db = userDb('reader');
  await assertSucceeds(setDoc(doc(db, 'usuarios', 'reader', 'historial', 'book-history-no-page'), { libroId: 'book-history-no-page', fechaLectura: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(db, 'usuarios', 'reader', 'historial', 'book-active'), { libroId: 'book-active', pagina: 3, fechaLectura: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(db, 'usuarios', 'reader', 'historial', 'book-active'), { libroId: 'book-active', fechaLectura: serverTimestamp() }, { merge: true }));
  await assertSucceeds(getDoc(doc(db, 'usuarios', 'reader', 'historial', 'book-active')));
  await assertFails(getDoc(doc(db, 'usuarios', 'other', 'historial', 'book-active')));
  await assertFails(setDoc(doc(db, 'usuarios', 'other', 'historial', 'book-active'), { libroId: 'book-active', pagina: 3, fechaLectura: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'usuarios', 'reader', 'historial', 'book-active'), { libroId: 'book-active', pagina: -1, fechaLectura: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'usuarios', 'reader', 'estado', 'lectura'), { ultimoLibroId: 'book-active', ultimaPaginaLeida: 3, fechaUltimaLectura: serverTimestamp(), rol: 'admin' }));
  await assertSucceeds(setDoc(doc(db, 'usuarios', 'reader', 'estado', 'lectura'), { ultimoLibroId: 'book-active', ultimaPaginaLeida: 3, fechaUltimaLectura: serverTimestamp() }));
  await assertSucceeds(getDoc(doc(db, 'usuarios', 'reader', 'estado', 'lectura')));
  await assertFails(getDoc(doc(db, 'usuarios', 'other', 'estado', 'lectura')));
});

test('la regla general deniega colecciones no declaradas', async () => {
  const db = userDb('reader');
  await assertFails(getDoc(doc(db, 'privateData', 'secret')));
  await assertFails(getDocs(collection(db, 'privateData')));
});
