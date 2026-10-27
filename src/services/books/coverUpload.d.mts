export const COVER_UPLOAD_MAX_BYTES: number;
export const COVER_STORED_MAX_BYTES: number;
export function validateCoverUploadFile(file: Pick<File, 'name' | 'type' | 'size'> | null | undefined): { valid: boolean; reason: string };
export function assessCoverDimensions(width: number, height: number): { valid: boolean; isPortrait: boolean; lowResolution: boolean; requiresConfirmation: boolean };
