import type { TicketPriorityRef, TicketStatusRef } from '@/types/api';

/**
 * Status and priority colours come from the organization's own configuration, so a
 * custom workflow renders correctly without any code change here.
 */
export function StatusBadge({ status }: { status: TicketStatusRef }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium"
      style={{ borderColor: `${status.color}55`, backgroundColor: `${status.color}14`, color: status.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: status.color }} aria-hidden />
      {status.name}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: TicketPriorityRef }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: priority.color }}>
      <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: priority.color }} aria-hidden />
      {priority.name}
    </span>
  );
}

export function TagChip({ tag }: { tag: { name: string; color: string } }) {
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: `${tag.color}1f`, color: tag.color }}
    >
      {tag.name}
    </span>
  );
}
