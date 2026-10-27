# Configuración de Firebase y cuentas

## Firebase

1. En Firebase Console, activa Authentication → Proveedores de acceso → Correo electrónico/contraseña y configura la plantilla de verificación de correo. El registro dentro de la app crea cuentas limitadas; no crea perfiles activos.
2. Crea Cloud Firestore en modo producción.
3. Configura `.env.local` usando `.env.example`. Solo usa la configuración pública de la app web `VITE_FIREBASE_*`; nunca pongas claves de Admin SDK en el frontend. `.env.local` está excluido de Git.
4. Las reglas locales están en `firestore.rules`; los índices en `firestore.indexes.json` (no hay índices compuestos requeridos por las consultas actuales). No despliegues reglas hasta revisarlas manualmente.

## Solicitudes de acceso con Firestore Rules

El registro crea la cuenta de Firebase Authentication, envía el correo de verificación y guarda únicamente `solicitudesAcceso/{uid}` con estado `pending`. La solicitud no crea `usuarios/{uid}`. Las reglas permiten leer solo esa solicitud propia y deniegan libros, categorías, favoritos, historial y progreso hasta tener un perfil activo.

La bandeja, aprobación, rechazo, suspensión y reactivación usan directamente Firestore. Las reglas solo aceptan transiciones del cliente si el token contiene el custom claim `admin: true` y el perfil del administrador está activo. Operaciones entre el perfil y la solicitud se realizan en una transacción; `getAfter()` en las reglas obliga a que ambas partes queden coherentes. Los clientes administradores no pueden editar otros campos del perfil ni asignar roles.

Cuando el solicitante pulsa **Actualizar estado** después de verificar su correo, la app vuelve a cargar el usuario y fuerza un ID token nuevo (`getIdToken(true)`). Si Firebase Authentication firma `email_verified: true` y el correo del token coincide con la solicitud, las reglas permiten guardar una marca de verificación. No se acepta esa marca sin el claim firmado.

```powershell
npm run test:rules
```

**Límite de Firestore Rules:** las reglas solo ven el token del usuario que realiza una operación y los documentos de Firestore. No pueden consultar en vivo el registro de Authentication de otra persona. La marca prueba que Firebase emitió un token verificado para ese correo en el momento de actualizarla. Para verificar que el correo siga siendo el actual justo al aprobar, comprueba también Authentication → Users en Firebase Console antes de pulsar Aprobar. Esta comprobación manual evita confiar únicamente en una marca vieja si el correo de Authentication se cambió después.

Este flujo no usa Cloud Functions ni requiere cambiar al plan Blaze. No habilites ningún servicio de pago para las funciones descritas aquí.

## Crear las cuentas

No compartas cuentas. Gerson y Miriam crean sus propias credenciales desde la app; la cuenta propietaria/administradora se mantiene separada.

Gerson y Miriam envían solicitudes desde «Crear cuenta» y verifican su correo. Después regresan a la app y pulsan **Actualizar estado** para que el token actualizado registre esa verificación. El administrador comprueba la verificación actual en Authentication → Users y las aprueba desde Administración → Solicitudes de acceso. La transacción autorizada crea el perfil `usuarios/{UID}` activo y actualiza la solicitud en conjunto.

El catálogo requiere un perfil activo. Para suspender o reactivar lectores, usa Administración → Solicitudes de acceso. Las reglas deniegan cualquier cambio de estado que no esté emparejado con la transición correspondiente de la solicitud.

### Primer administrador

1. Crea la cuenta independiente del propietario en Authentication, verifica su correo y crea su perfil activo en `usuarios/{UID}` desde Firebase Console.
2. Primero consulta el estado sin modificar Authentication ni Firestore. El Firebase CLI y Application Default Credentials (ADC) son inicios de sesión distintos. Para usar el Admin SDK localmente con Authentication, [Firebase documenta](https://firebase.google.com/docs/admin/setup#test_with_gcloud_end_user_credentials) que las credenciales ADC de usuario requieren un OAuth Client ID de tipo Desktop; el inicio de sesión ADC estándar no basta necesariamente. Usa una identidad con permisos de lectura en Authentication y Firestore, y guarda el archivo OAuth descargado fuera del repositorio:

```powershell
$env:FIREBASE_PROJECT_ID = 'masterfull-library'
gcloud auth application-default login --client-id-file='C:\ruta-segura-fuera-del-repositorio\oauth-client.json'
npm run admin:check -- 'correo-administrativo@dominio.com'
Remove-Item Env:FIREBASE_PROJECT_ID
```

Reemplaza la ruta de ejemplo por el archivo OAuth Client ID existente. Ese archivo contiene datos sensibles: no lo pegues en el chat, no lo subas a GitHub y no es una clave privada de cuenta de servicio. La consulta muestra UID, correo verificado, estado habilitado, custom claims y existencia/estado del perfil; `admin:check` solo ejecuta lecturas. Si no tienes `gcloud` o el cliente OAuth configurado, solicita al administrador del proyecto un método ADC de solo lectura. No se genera ninguna clave privada.

3. Solo si luego autorizas la asignación, configura ADC. Si tu entorno requiere una clave de servicio ya existente, guárdala fuera del repositorio y establece temporalmente `GOOGLE_APPLICATION_CREDENTIALS`:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = 'C:\ruta-segura-fuera-del-repositorio\credencial-existente.json'
$env:FIREBASE_PROJECT_ID = 'masterfull-library'
npm run admin:grant -- 'correo-verificado-del-propietario@dominio.com'
Remove-Item Env:GOOGLE_APPLICATION_CREDENTIALS
Remove-Item Env:FIREBASE_PROJECT_ID
```

El script de asignación valida correo, UID, verificación, estado de la cuenta y perfil activo, y preserva otros custom claims. Cierra sesión y vuelve a iniciarla para recibir el claim. No ejecutes este comando de escritura sin autorización expresa.

## Probar reglas y desplegarlas manualmente

Ejecuta localmente:

```powershell
npm run test:rules
```

El comando usa el emulador y el proyecto `demo-masterfull-library-rules`; no toca producción. Antes de publicar, compara `firestore.rules` con la versión publicada que muestra Firebase Console → Firestore Database → Rules. La consulta automatizada no pudo leer el proyecto en esta revisión porque las credenciales guardadas del Firebase CLI expiraron; vuelve a iniciar sesión para recuperar el acceso de solo lectura. Despliega solo después de revisar las reglas y los resultados, usando una cuenta autorizada:

```powershell
npx firebase-tools login --reauth
npx firebase-tools deploy --only firestore --project masterfull-library
```

El destino `firestore` publica las reglas e índices configurados en `firebase.json`. Verifica cuidadosamente el ID del proyecto antes del despliegue. No despliega Authentication, datos ni servicios de pago.

## Enlaces de lectura de Google Drive

1. Sube manualmente a Drive un PDF que tengas derecho a compartir.
2. En Drive → Compartir, establece Acceso general → Cualquier persona con el enlace → Lector.
3. Copia el enlace HTTPS de tipo `https://drive.google.com/file/d/FILE_ID/view`.
4. En Administración → Libros, pega el enlace. La aplicación valida el dominio y formato, extrae `FILE_ID`, y guarda la URL normalizada junto con el identificador.
5. El botón Leer libro abre `/preview` en un iframe integrado.

El permiso de enlace hace público el acceso para cualquiera que obtenga la URL. Ocultar la URL en el catálogo no protege el PDF. No uses este método para material restringido, confidencial o que no tengas derecho a compartir. La app no cambia permisos ni comprueba la disponibilidad del archivo. Google controla el visor; algunos errores de carga no se pueden leer desde otro origen. La aplicación no puede conocer la página actual dentro del iframe y solo guarda el libro y la fecha de apertura.

No se requiere Storage, Google Drive API, OAuth, una cuenta de facturación ni una clave de servicio para los enlaces y el visor.
