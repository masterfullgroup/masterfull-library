import { COVER_STORED_MAX_BYTES } from './coverUpload.mjs';

export type PreparedCover = { blob: Blob; fileName: string; contentType: string; optimized: boolean };

export async function prepareCover(file: File, preferredName = file.name): Promise<PreparedCover> {
  if (file.size <= COVER_STORED_MAX_BYTES) return { blob: file, fileName: preferredName, contentType: file.type, optimized: false };
  const bitmap = await createImageBitmap(file);
  try {
    const sourceWidth = bitmap.width;
    const sourceHeight = bitmap.height;
    if (sourceWidth * sourceHeight > 40_000_000) throw new Error('La imagen tiene demasiados píxeles para procesarla de forma segura. Usa una versión menor a 40 megapíxeles.');
    const limits = [2400, 2000, 1800, 1600, 1400, 1200];
    const qualities = [0.92, 0.88, 0.84, 0.8, 0.76];
    for (const maxSide of limits) {
      const ratio = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
      const width = Math.max(1, Math.round(sourceWidth * ratio));
      const height = Math.max(1, Math.round(sourceHeight * ratio));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Este navegador no pudo preparar la imagen. Prueba con JPG, PNG o WebP de menos de 2 MB.');
      context.drawImage(bitmap, 0, 0, width, height);
      for (const quality of qualities) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
        if (blob && blob.type === 'image/webp' && blob.size <= COVER_STORED_MAX_BYTES) {
          return { blob, fileName: preferredName.replace(/\.[^.]+$/, '.webp'), contentType: 'image/webp', optimized: true };
        }
      }
    }
    throw new Error('No se pudo reducir la imagen a 2 MB conservando una resolución adecuada. Elige una imagen menor.');
  } finally {
    bitmap.close();
  }
}
