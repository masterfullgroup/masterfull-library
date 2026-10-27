/// <reference types="vite/client" />

// Fallback declarations for the partially published SDK package in this environment.
declare module 'firebase/app' {
  export const getApp: any;
  export const getApps: any;
  export const initializeApp: any;
}
declare module 'firebase/auth' {
  export type User = any;
  export const browserLocalPersistence: any;
  export const getAuth: any;
  export const onIdTokenChanged: any;
  export const setPersistence: any;
  export const signInWithEmailAndPassword: any;
  export const sendPasswordResetEmail: any;
  export const signOut: any;
  export const createUserWithEmailAndPassword: any;
  export const sendEmailVerification: any;
  export const updateProfile: any;
}
declare module 'firebase/firestore' {
  export const addDoc: any;
  export const collection: any;
  export const deleteDoc: any;
  export const doc: any;
  export const getDoc: any;
  export const getDocs: any;
  export const getFirestore: any;
  export const limit: any;
  export const onSnapshot: any;
  export const orderBy: any;
  export const query: any;
  export const serverTimestamp: any;
  export const setDoc: any;
  export const updateDoc: any;
  export const runTransaction: any;
  export const where: any;
  export const writeBatch: any;
}
