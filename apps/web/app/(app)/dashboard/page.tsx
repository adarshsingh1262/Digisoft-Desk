'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { PERMISSIONS } from '@digisoft/shared';
import { accountsService } from '@/services/accounts.service';
import { contactsService } from '@/services/contacts.service';
import { departmentsService, usersService } from '@/services/settings.service';
import { ticketsService } from '@/services/tickets.service';
import { useAuthStore } from '@/stores/auth.store';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/states';
import { ApiError } from '@/lib/api-client';

function StatCard({
  label,
  value,
  loading,
  href,
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/50"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      {loading ? (
        <div className="mt-2 h-7 w-16 animate-pulse rounded bg-muted" aria-hidden />
      ) : (
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value ?? 0}</p>
      )}
    </Link>
  );
}

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const can = useAuthStore((state) => state.can);

  const tickets = useQuery({
    queryKey: ['tickets', 'summary'],
    queryFn: ticketsService.summary,
    enabled: can(PERMISSIONS.TICKET_READ),
  });
  const contacts = useQuery({
    queryKey: ['contacts', { pageSize: 1 }],
    queryFn: () => contactsService.list({ page: 1, pageSize: 1 }),
    enabled: can(PERMISSIONS.CONTACT_READ),
  });
  const accounts = useQuery({
    queryKey: ['accounts', { pageSize: 1 }],
    queryFn: () => accountsService.list({ page: 1, pageSize: 1 }),
    enabled: can(PERMISSIONS.ACCOUNT_READ),
  });
  const users = useQuery({
    queryKey: ['users', { pageSize: 1 }],
    queryFn: () => usersService.list({ page: 1, pageSize: 1 }),
    enabled: can(PERMISSIONS.USER_READ),
  });
  const departments = useQuery({
    queryKey: ['departments'],
    queryFn: departmentsService.list,
    enabled: can(PERMISSIONS.DEPARTMENT_READ),
  });

  const failed = [tickets, contacts, accounts, users, departments].find((query) => query.isError);
  if (failed?.error) {
    const message =
      failed.error instanceof ApiError ? failed.error.message : 'Unable to load the dashboard.';
    return <ErrorState message={message} onRetry={() => failed.refetch()} />;
  }

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user?.firstName ?? ''}`.trim()}
        description="Foundation modules currently available in this workspace."
      />

      {can(PERMISSIONS.TICKET_READ) ? (
        <section aria-label="Ticket queue" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Open tickets"
            value={tickets.data?.open}
            loading={tickets.isPending}
            href="/tickets"
          />
          <StatCard
            label="Assigned to me"
            value={tickets.data?.assignedToMe}
            loading={tickets.isPending}
            href="/tickets"
          />
          <StatCard
            label="Unassigned"
            value={tickets.data?.unassigned}
            loading={tickets.isPending}
            href="/tickets"
          />
          <StatCard
            label="Resolved"
            value={tickets.data?.resolved}
            loading={tickets.isPending}
            href="/tickets"
          />
        </section>
      ) : null}

      <section aria-label="Overview" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {can(PERMISSIONS.CONTACT_READ) ? (
          <StatCard label="Contacts" value={contacts.data?.meta.total} loading={contacts.isPending} href="/customers" />
        ) : null}
        {can(PERMISSIONS.ACCOUNT_READ) ? (
          <StatCard label="Accounts" value={accounts.data?.meta.total} loading={accounts.isPending} href="/accounts" />
        ) : null}
        {can(PERMISSIONS.USER_READ) ? (
          <StatCard label="Agents" value={users.data?.meta.total} loading={users.isPending} href="/settings/users" />
        ) : null}
        {can(PERMISSIONS.DEPARTMENT_READ) ? (
          <StatCard
            label="Departments"
            value={departments.data?.length}
            loading={departments.isPending}
            href="/settings/departments"
          />
        ) : null}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Not built yet</CardTitle>
          <CardDescription>
            SLA, automation, the knowledge base, omnichannel and analytics arrive in later phases.
            Nothing above is placeholder data — every figure comes from the API.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="list-inside list-disc space-y-1">
            <li>Phase 3 — activities, assignment rules, automation, SLA, escalation, blueprints</li>
            <li>Phase 4 — knowledge base, help center, customer portal, web forms, community</li>
            <li>Phase 5 — email, live chat, WhatsApp, Instagram, Messenger, Telegram, telephony</li>
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
