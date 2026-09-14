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

import type { SlaFields } from '@/types/api';

/**
 * One glance at the SLA state: breached, due within the hour, paused, or on track.
 * Uses the resolution target once the first response is in, otherwise first response.
 */
export function SlaBadge({ ticket }: { ticket: SlaFields & { resolvedAt: string | null } }) {
  if (!ticket.slaPolicy || ticket.resolvedAt) return null;
  if (ticket.slaPausedAt) {
    return <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">SLA paused</span>;
  }
  const awaitingFirst = !ticket.firstResponseAt;
  const breached = awaitingFirst ? ticket.firstResponseBreachedAt : ticket.resolutionBreachedAt;
  const due = awaitingFirst ? ticket.firstResponseDueAt : ticket.resolutionDueAt;
  if (breached || (due && new Date(due) < new Date())) {
    return <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-800 dark:bg-red-950 dark:text-red-300">SLA breached</span>;
  }
  if (!due) return null;
  const minutes = Math.round((new Date(due).getTime() - Date.now()) / 60_000);
  if (minutes <= 60) {
    return <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-300">{awaitingFirst ? 'Reply' : 'Due'} in {minutes}m</span>;
  }
  return null;
}
