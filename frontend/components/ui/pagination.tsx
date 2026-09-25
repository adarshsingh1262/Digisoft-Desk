'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PageMeta } from '@digisoft/shared';
import { Button } from './button';

export function Pagination({
  meta,
  onPageChange,
}: {
  meta: PageMeta;
  onPageChange: (page: number) => void;
}) {
  const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.page * meta.pageSize, meta.total);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-sm"
    >
      <p className="text-muted-foreground">
        {from}–{to} of {meta.total}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={meta.page <= 1}
          onClick={() => onPageChange(meta.page - 1)}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Previous
        </Button>
        <span className="px-2 text-muted-foreground">
          Page {meta.page} of {meta.totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={meta.page >= meta.totalPages}
          onClick={() => onPageChange(meta.page + 1)}
        >
          Next
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
