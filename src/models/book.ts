export type BookFormat = 'PDF' | 'EPUB';

export interface Book {
  id: string;
  title: string;
  subtitle?: string;
  authors: string[];
  publisher?: string;
  year?: number;
  edition?: string;
  isbn?: string;
  language: string;
  category: string;
  subcategory?: string;
  description: string;
  pages?: number;
  format: BookFormat;
  sizeLabel: string;
  addedAt: string;
  cover: 'atom' | 'wave' | 'orbit' | 'botanical' | 'numbers' | 'signal' | 'stone' | 'grid' | 'light';
  accent: string;
  demo?: boolean;
  tags?: string[];
  coverUrl?: string;
  fileProvider?: string;
  fileReference?: string;
  driveFileId?: string;
  driveUrl?: string;
  active?: boolean;
  categoryId?: string;
  subcategoryId?: string;
}

export interface LibraryCategory {
  id: string;
  name: string;
  description: string;
  icon: 'atom' | 'function' | 'flask' | 'cpu' | 'briefcase' | 'book' | 'leaf' | 'globe';
  active: boolean;
  parentId?: string | null;
}
