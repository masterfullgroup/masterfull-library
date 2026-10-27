import { collection, doc, getDocs, orderBy, query, runTransaction, serverTimestamp } from 'firebase/firestore';
import { firebaseAuth, firestore } from '../firebase/client';

export type AccessRequest = {
  uid: string;
  nombre: string;
  correo: string;
  estado: 'pending' | 'approved' | 'rejected' | 'suspended';
  emailVerified: boolean;
  createdAt: string | null;
};

export async function fetchAccessRequests() {
  if (!firestore) throw new Error('Firebase no está configurado.');
  const snapshot = await getDocs(query(collection(firestore, 'solicitudesAcceso'), orderBy('createdAt', 'desc')));
  return snapshot.docs.map((item: any) => {
    const data = item.data();
    const createdAt = data.createdAt?.toDate?.();
    return {
      uid: item.id,
      nombre: String(data.nombre ?? ''),
      correo: String(data.correo ?? ''),
      estado: data.estado as AccessRequest['estado'],
      emailVerified: data.correoVerificado === true,
      createdAt: createdAt instanceof Date ? createdAt.toISOString() : null,
    };
  });
}

export async function manageAccessRequest(action: 'approveAccessRequest' | 'rejectAccessRequest' | 'setUserSuspended' | 'reactivateUser', uid: string) {
  if (!firestore || !firebaseAuth?.currentUser) throw new Error('Inicia sesión con tu cuenta administradora.');
  const adminUid = firebaseAuth.currentUser.uid;
  const requestRef = doc(firestore, 'solicitudesAcceso', uid);
  const profileRef = doc(firestore, 'usuarios', uid);
  await runTransaction(firestore, async (transaction: any) => {
    const requestSnapshot = await transaction.get(requestRef);
    if (!requestSnapshot.exists()) throw new Error('No existe la solicitud.');
    const request = requestSnapshot.data();
    const profileSnapshot = await transaction.get(profileRef);
    const now = serverTimestamp();
    if (action === 'approveAccessRequest') {
      if (request.estado !== 'pending' || request.correoVerificado !== true || profileSnapshot.exists()) throw new Error('Solo se puede aprobar una solicitud pendiente con correo verificado.');
      transaction.set(profileRef, { uid, nombre: request.nombre, correo: request.correo, activo: true, estadoCuenta: 'approved', aprobadoPor: adminUid, aprobadoEn: now });
      transaction.update(requestRef, { estado: 'approved', aprobadoPor: adminUid, aprobadoEn: now });
    } else if (action === 'rejectAccessRequest') {
      if (request.estado !== 'pending' || profileSnapshot.exists()) throw new Error('Solo se puede rechazar una solicitud pendiente.');
      transaction.update(requestRef, { estado: 'rejected', rechazadoPor: adminUid, rechazadoEn: now });
    } else if (action === 'setUserSuspended') {
      if (request.estado !== 'approved' || !profileSnapshot.exists() || profileSnapshot.data().activo !== true) throw new Error('Solo se puede suspender una cuenta activa.');
      transaction.update(profileRef, { activo: false, estadoCuenta: 'suspendido', suspendidoPor: adminUid, suspendidoEn: now });
      transaction.update(requestRef, { estado: 'suspended', suspendidoPor: adminUid, suspendidoEn: now });
    } else {
      if (request.estado !== 'suspended' || !profileSnapshot.exists() || profileSnapshot.data().estadoCuenta !== 'suspendido') throw new Error('Solo se puede reactivar una cuenta suspendida.');
      transaction.update(profileRef, { activo: true, estadoCuenta: 'approved', reactivadoPor: adminUid, reactivadoEn: now });
      transaction.update(requestRef, { estado: 'approved', reactivadoPor: adminUid, reactivadoEn: now });
    }
  });
}
