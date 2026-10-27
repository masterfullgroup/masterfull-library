export interface NormalizedDriveFile {
  driveFileId: string;
  driveUrl: string;
  previewUrl: string;
}

export function extractDriveFileId(value: string): string;
export function normalizeDriveFile(value: string): NormalizedDriveFile;
