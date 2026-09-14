'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { PERMISSIONS } from '@digisoft/shared';
import { ApiError } from '@/lib/api-client';
import { ticketConfigService, ticketsService } from '@/services/tickets.service';
import { useAuthStore } from '@/stores/auth.store';
import { formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { NewTicketDialog } from '@/components/tickets/new-ticket-dialog';
import { PriorityBadge, SlaBadge, StatusBadge, TagChip } from '@/components/tickets/ticket-badges';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { DataTable, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';

type View = 'all' | 'open' | 'mine' | 'unassigned';

const VIEWS: { key: View; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'mine', label: 'Assigned to me' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'all', label: 'All' },
];

export default function TicketsPage() {
  const can = useAuthStore((state) => state.can);
  const [view, setView] = useState<View>('open');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [statusId, setStatusId] = useState('');
  const [priorityId, setPriorityId] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const statuses = useQuery({ queryKey: ['ticket-statuses'], queryFn: ticketConfigService.statuses });
  const priorities = useQuery({
    queryKey: ['ticket-priorities'],
    queryFn: ticketConfigService.priorities,
  });
  const summary = useQuery({ queryKey: ['tickets', 'summary'], queryFn: ticketsService.summary });

  const params = useMemo(
    () => ({
      page,
      pageSize: 25,
      q: query || undefined,
      statusId: statusId || undefined,
      priorityId: priorityId || undefined,
      ...(view === 'open' ? { open: true } : {}),
      ...(view === 'mine' ? { assignedToMe: true } : {}),
      ...(view === 'unassigned' ? { unassigned: true, open: true } : {}),
      sort: 'updatedAt',
      order: 'desc' as const,
    }),
    [page, query, statusId, priorityId, view],
  );

  const tickets = useQuery({
    queryKey: ['tickets', params],
    queryFn: () => ticketsService.list(params),
  });

  const counts: Record<View, number | undefined> = {
    all: summary.data?.total,
    open: summary.data?.open,
    mine: summary.data?.assignedToMe,
    unassigned: summary.data?.unassigned,
  };

  return (
    <>
      <PageHeader
        title="Tickets"
        description="Every request your team is working on."
        actions={
          can(PERMISSIONS.TICKET_CREATE) ? (
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              New ticket
            </Button>
          ) : null
        }
      />

      <nav aria-label="Saved views" className="flex flex-wrap gap-1">
        {VIEWS.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={view === item.key}
            onClick={() => {
              setView(item.key);
              setPage(1);
            }}
            className={`rounded-md px-3 py-1.5 text-sm ${
              view === item.key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {item.label}
            {counts[item.key] !== undefined ? (
              <span className="ml-1.5 tabular-nums opacity-70">{counts[item.key]}</span>
            ) : null}
          </button>
        ))}
      </nav>

      <form
        role="search"
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setQuery(search.trim());
        }}
      >
        <div className="min-w-[14rem] flex-1">
          <label htmlFor="ticket-search" className="sr-only">
            Search tickets
          </label>
          <Input
            id="ticket-search"
            placeholder="Search by subject, description or #number"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="filter-status" className="sr-only">
            Filter by status
          </label>
          <Select
            id="filter-status"
            value={statusId}
            onChange={(event) => {
              setStatusId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {statuses.data?.map((status) => (
              <option key={status.id} value={status.id}>
                {status.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="filter-priority" className="sr-only">
            Filter by priority
          </label>
          <Select
            id="filter-priority"
            value={priorityId}
            onChange={(event) => {
              setPriorityId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All priorities</option>
            {priorities.data?.map((priority) => (
              <option key={priority.id} value={priority.id}>
                {priority.name}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="outline">
          <Search className="h-4 w-4" aria-hidden />
          Search
        </Button>
      </form>

      <Card>
        {tickets.isPending ? (
          <TableSkeleton columns={6} />
        ) : tickets.isError ? (
          <ErrorState
            message={
              tickets.error instanceof ApiError ? tickets.error.message : 'Unable to load tickets.'
            }
            onRetry={() => tickets.refetch()}
          />
        ) : tickets.data.items.length === 0 ? (
          <EmptyState
            title={query ? 'No tickets match that search' : 'No tickets in this view'}
            description={
              query
                ? 'Try a different subject, description or ticket number.'
                : 'Raise the first ticket for a customer.'
            }
            action={
              can(PERMISSIONS.TICKET_CREATE) && !query ? (
                <Button onClick={() => setDialogOpen(true)}>New ticket</Button>
              ) : null
            }
          />
        ) : (
          <>
            <DataTable>
              <THead>
                <TR>
                  <TH>#</TH>
                  <TH>Subject</TH>
                  <TH>Requester</TH>
                  <TH>Status</TH>
                  <TH>Priority</TH>
                  <TH>Assignee</TH>
                  <TH>Updated</TH>
                </TR>
              </THead>
              <TBody>
                {tickets.data.items.map((ticket) => (
                  <TR key={ticket.id}>
                    <TD className="tabular-nums text-muted-foreground">{ticket.ticketNumber}</TD>
                    <TD>
                      <Link href={`/tickets/${ticket.id}`} className="font-medium hover:underline">
                        {ticket.subject}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {ticket.tags.map((entry) => (
                          <TagChip key={entry.tag.id} tag={entry.tag} />
                        ))}
                      </div>
                    </TD>
                    <TD className="text-muted-foreground">
                      {ticket.contact
                        ? `${ticket.contact.firstName} ${ticket.contact.lastName ?? ''}`.trim()
                        : '—'}
                    </TD>
                    <TD>
                      <div className="flex flex-wrap items-center gap-1"><StatusBadge status={ticket.status} /><SlaBadge ticket={ticket} /></div>
                    </TD>
                    <TD>
                      <PriorityBadge priority={ticket.priority} />
                    </TD>
                    <TD className="text-muted-foreground">
                      {ticket.assignedAgent
                        ? `${ticket.assignedAgent.firstName} ${ticket.assignedAgent.lastName}`
                        : 'Unassigned'}
                    </TD>
                    <TD className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(ticket.updatedAt)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </DataTable>
            <Pagination meta={tickets.data.meta} onPageChange={setPage} />
          </>
        )}
      </Card>

      <NewTicketDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
