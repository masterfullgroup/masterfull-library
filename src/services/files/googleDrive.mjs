const DRIVE_HOST = 'drive.google.com';
const FILE_ID_PATTERN = /^[A-Za-z0-9_-]{10,200}$/;

export function extractDriveFileId(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Pega un enlace de Google Drive.');
  }

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('El enlace no tiene un formato válido.');
  }

  if (url.protocol !== 'https:' || url.hostname !== DRIVE_HOST || url.username || url.password || url.port) {
    throw new Error('Usa un enlace HTTPS de drive.google.com.');
  }

  const pathMatch = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)(?:\/|$)/);
  const fileId = pathMatch?.[1] ?? (url.pathname === '/open' ? url.searchParams.get('id') : null);
  if (!fileId || !FILE_ID_PATTERN.test(fileId)) {
    throw new Error('No encontramos un identificador de archivo válido en el enlace.');
  }
  return fileId;
}

export function normalizeDriveFile(value) {
  const driveFileId = extractDriveFileId(value);
  return {
    driveFileId,
    driveUrl: `https://${DRIVE_HOST}/file/d/${driveFileId}/view`,
    previewUrl: `https://${DRIVE_HOST}/file/d/${driveFileId}/preview`,
  };
}
