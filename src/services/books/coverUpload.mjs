export const COVER_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const COVER_STORED_MAX_BYTES = 2 * 1024 * 1024;

const ALLOWED_COVER_TYPES = new Map([
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
]);

export function validateCoverUploadFile(file) {
  if (!file || typeof file !== 'object') return { valid: false, reason: 'Selecciona una imagen.' };
  const extension = String(file.name ?? '').split('.').pop()?.toLowerCase() ?? '';
  const expectedType = ALLOWED_COVER_TYPES.get(extension);
  if (!expectedType || file.type !== expectedType) return { valid: false, reason: 'Formato no admitido. Selecciona una imagen JPG, PNG o WebP.' };
  if (!Number.isFinite(file.size) || file.size <= 0) return { valid: false, reason: 'El archivo está vacío o no se pudo leer.' };
  if (file.size > COVER_UPLOAD_MAX_BYTES) return { valid: false, reason: 'La imagen supera el límite de 10 MB.' };
  return { valid: true, reason: '' };
}

export function assessCoverDimensions(width, height) {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    return { valid: false, isPortrait: false, lowResolution: false, requiresConfirmation: false };
  }
  const isPortrait = height > width;
  const lowResolution = width < 400 || height < 600;
  return { valid: true, isPortrait, lowResolution, requiresConfirmation: lowResolution || !isPortrait };
}
