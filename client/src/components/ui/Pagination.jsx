import { LuChevronLeft, LuChevronRight } from 'react-icons/lu';
import { Button } from './Button';

export function Pagination({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = total ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 px-1 pt-3">
      <p className="text-desc text-slate-500 tabular">
        {start}–{end} of {total.toLocaleString('en-IN')}
      </p>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="iconSm" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <LuChevronLeft />
        </Button>
        <span className="min-w-[4rem] text-center text-desc text-slate-600 tabular">
          {page} / {pages}
        </span>
        <Button variant="ghost" size="iconSm" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page">
          <LuChevronRight />
        </Button>
      </div>
    </div>
  );
}
