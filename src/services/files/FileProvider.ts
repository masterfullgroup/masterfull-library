import type { Book } from '../../models/book';
import { normalizeDriveFile } from './googleDrive.mjs';

export type FileResolution = { status: 'ready'; previewUrl: string } | { status: 'pending' | 'unavailable'; message: string };

export interface FileProvider {
  resolve(book: Book): Promise<FileResolution>;
}

/** Resolves a public-link Drive file for embedding. Link access is not private. */
export class GoogleDriveFileProvider implements FileProvider {
  async resolve(book: Book): Promise<FileResolution> {
    if (book.format !== 'PDF') return { status: 'unavailable', message: 'El lector integrado actualmente admite documentos PDF.' };
    const reference = book.driveUrl || book.fileReference;
    if (!reference && !book.driveFileId) return { status: 'pending', message: 'Este libro todavía no tiene un enlace de lectura.' };
    try {
      const legacyId = reference?.trim().match(/^[A-Za-z0-9_-]{10,200}$/)?.[0];
      const link = book.driveFileId
        ? `https://drive.google.com/file/d/${book.driveFileId}/view`
        : legacyId ? `https://drive.google.com/file/d/${legacyId}/view` : reference!;
      const { previewUrl } = normalizeDriveFile(link);
      return { status: 'ready', previewUrl };
    } catch (reason) {
      return { status: 'unavailable', message: reason instanceof Error ? reason.message : 'El enlace de Drive no es válido.' };
    }
  }
}

export const fileProvider = new GoogleDriveFileProvider();
