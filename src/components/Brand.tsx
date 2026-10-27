import { BookOpen } from 'lucide-react';

export default function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-lockup${compact ? ' brand-lockup--compact' : ''}`}>
      <span className="brand-mark" aria-hidden="true"><BookOpen size={21} strokeWidth={1.7} /></span>
      {!compact && <span className="brand-wordmark"><strong>masterfull</strong><span>library</span></span>}
    </div>
  );
}
