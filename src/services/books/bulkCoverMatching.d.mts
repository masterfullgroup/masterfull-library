export function normalizeCoverIsbn(value: unknown): string;
export function matchCoverFiles<TBook extends { id: string; isbn?: string }>(files: Array<{ name: string }>, books: TBook[]): Array<{ fileName: string; status: 'matched' | 'ambiguous' | 'unmatched'; book: TBook | null; reason?: string }>;
