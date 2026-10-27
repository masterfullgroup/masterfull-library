const required = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_GOOGLE_BOOKS_API_KEY',
];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) {
  console.error(`Faltan secretos de Actions necesarios para compilar la app: ${missing.join(', ')}`);
  process.exit(1);
}
if (process.env.VITE_FIREBASE_PROJECT_ID !== 'masterfull-library') {
  console.error('VITE_FIREBASE_PROJECT_ID debe apuntar al proyecto Masterfull Library autorizado.');
  process.exit(1);
}
console.log('Configuración de compilación presente; no se muestran los valores.');