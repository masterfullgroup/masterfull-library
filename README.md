# Masterfull Library 3.0

Biblioteca académica para lectores autorizados y una cuenta administradora. La aplicación usa React, TypeScript, Firebase Authentication y Cloud Firestore. Los PDFs se almacenan manualmente en Google Drive y se muestran mediante el visor integrado; la app no sube PDFs ni utiliza Firebase Storage, Drive API, OAuth ni sincronización de Drive. Las portadas se pueden guardar localmente en el repositorio para publicarlas como archivos estáticos.

## Funciones

- Inicio de sesión privado con correo y contraseña, cierre de sesión y recuperación mediante Firebase.
- Catálogo y categorías jerárquicas, búsqueda, filtros, favoritos e historial por usuario.
- Administración de metadatos, enlaces de lectura y portadas; edición y archivado reversible.
- Validador de enlaces de Drive y visor PDF dentro de la plataforma.
- Reglas de Firestore con custom claim `admin: true`, perfil activo y denegación por defecto.

## Desarrollo local

```bash
npm install
npm run dev
```

Configura las variables descritas en `.env.example` en `.env.local`. El archivo está excluido de Git. No guardes credenciales de cuenta de servicio en el proyecto.

Para buscar portadas, habilita **Google Books API** en un proyecto de Google Cloud y crea una API key estándar restringida a esa API y a los dominios de la aplicación. Guarda la clave en `VITE_GOOGLE_BOOKS_API_KEY` dentro de `.env.local`; las claves `VITE_` se incluyen en el código del navegador, así que no uses credenciales de cuenta de servicio ni claves sin restricciones. En desarrollo local agrega `http://localhost:5173/*` y `http://127.0.0.1:5173/*` como referrers permitidos. La búsqueda se realiza solo al pulsar el botón y usa la cuota configurada para Google Books.

## Verificaciones

```bash
npm run build
npm run test:drive
npm run test:books
npm run test:google-books
npm run test:rules
```

`test:rules` inicia el emulador local de Firestore con un proyecto `demo-*`; no despliega reglas ni escribe en producción.

## Alta de las cuentas

En Firebase Console → Authentication → Users, crea por separado las cuentas personales de Gerson y Miriam y la cuenta exclusiva del propietario. No actives el registro público en la aplicación. Para cada cuenta, copia su UID y crea `usuarios/{UID}` en Firestore con `uid`, `nombre`, `correo` y `activo: true`. No agregues `rol: "admin"` para conceder permisos.

Para la cuenta del propietario, verifica el correo y asigna el claim con el script `npm run admin:grant` siguiendo [FIREBASE_SETUP.md](FIREBASE_SETUP.md). Después, cierra sesión y vuelve a entrar para renovar el token.

## Registrar un PDF

1. Sube a Google Drive solo un documento que tengas derecho a compartir.
2. En Drive, abre Compartir y configura Acceso general → Cualquier persona con el enlace → Lector.
3. Copia el enlace del archivo.
4. En Masterfull Library, abre Administración → Libros y completa los datos, el enlace HTTPS de Drive y una URL HTTPS de portada opcional.
5. Guarda y selecciona **Leer libro** en la ficha.

Los enlaces con acceso general no son privados: toda persona que obtenga el enlace puede abrir el PDF fuera de Masterfull Library. La plataforma no cambia los permisos de Drive y no puede comprobar si el archivo sigue disponible. El visor de Drive también puede mostrar errores que el navegador no permite detectar desde la aplicación. La aplicación no registra páginas leídas ni porcentaje de avance.

## Publicación

Las reglas no se despliegan desde esta aplicación. Revisa las reglas y su suite local antes de desplegar manualmente; los pasos están en [FIREBASE_SETUP.md](FIREBASE_SETUP.md). La aplicación usa GitHub Actions para compilar `dist` y publicarlo en GitHub Pages al actualizar `main`. Las solicitudes de extracción solo compilan y no despliegan.

## Portadas locales en GitHub Pages

Desde Administración → Libros → Subir imagen, el servidor de desarrollo local valida el token firmado de Firebase (administrador, correo verificado y perfil activo) y guarda el archivo en `public/portadas/` con un nombre aleatorio. Acepta originales de hasta 10 MB y, si pasan de 2 MB, el navegador crea una copia WebP optimizada de hasta 2 MB, sin recortarla y conservando la proporción. El endpoint solo existe durante `npm run dev`, escucha en `127.0.0.1:5173` y no usa credenciales privadas ni comandos enviados por la web.

Después de guardar, usa «Copiar comandos Git» y ejecútalos en PowerShell desde la raíz del repositorio. Esto publica el archivo al subir el commit al origen remoto; no se ejecuta automáticamente. Espera a que GitHub Pages termine su publicación y pulsa «Comprobar publicación». Firestore no recibe la URL hasta que GitHub Pages devuelve la imagen.

La URL predeterminada corresponde al Pages de proyecto de `masterfullgroup/masterfull-library`: `https://masterfullgroup.github.io/masterfull-library/`. El desarrollo local sigue usando la raíz del servidor; la compilación pública usa `/masterfull-library/`. Si el repositorio tiene un dominio personalizado, define `VITE_GITHUB_PAGES_URL` en `.env.local` con la URL base HTTPS terminada en `/`. Las imágenes de GitHub Pages son públicas; no publiques cubiertas con derechos o información que deba permanecer privada.

## GitHub Pages

Antes del primer despliegue, configura en GitHub → Settings → Pages la fuente **GitHub Actions** y agrega en Settings → Secrets and variables → Actions los valores `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MESSAGING_SENDER_ID` y `VITE_GOOGLE_BOOKS_API_KEY`. La compilación comprueba que estén presentes y que el proyecto Firebase sea `masterfull-library`; nunca imprime sus valores. Las variables `VITE_` se empaquetan en el navegador y son visibles para visitantes: Firebase y Google Books deben tener las restricciones apropiadas en sus consolas.

Agrega `masterfullgroup.github.io` a Firebase Authentication → Settings → Authorized domains. Revisa también las restricciones de HTTP referrer de Google Books para el dominio público. El workflow compila solicitudes de extracción sin desplegarlas; solo despliega desde `main` (push a `main` o ejecución manual seleccionando `main`).