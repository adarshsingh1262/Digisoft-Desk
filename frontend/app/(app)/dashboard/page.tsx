'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { PERMISSIONS } from '@digisoft/shared';
import { accountsService } from '@/services/accounts.service';
import { contactsService } from '@/services/contacts.service';
import { departmentsService, usersService } from '@/services/settings.service';
import { analyticsService } from '@/services/analytics.service';
import { ticketsService } from '@/services/tickets.service';
import { useAuthStore } from '@/stores/auth.store';
import { PageHeader } from '@/components/layout/page-header';
import { ReportFilters, toQuery, type ReportFilterValue } from '@/components/reports/report-filters';
import { StatTile, formatMinutes, formatPercent } from '@/components/reports/stat-tile';
import { TrendChart } from '@/components/reports/trend-chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, LoadingState } from '@/components/ui/states';
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
  const [filters, setFilters] = useState<ReportFilterValue>({ range: '30d' });

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

  const dashboard = useQuery({
    queryKey: ['dashboard', filters],
    queryFn: () => analyticsService.dashboard(toQuery(filters)),
    enabled: can(PERMISSIONS.REPORT_READ),
  });
  // Per-viewer, so it comes from the ticket queue endpoint rather than the
  // organization-wide analytics dashboard.
  const ticketSummary = useQuery({
    queryKey: ['tickets', 'summary'],
    queryFn: ticketsService.summary,
    enabled: can(PERMISSIONS.TICKET_READ),
  });

  const overviewFailed = [contacts, accounts, users, departments].find((query) => query.isError);
  if (overviewFailed?.error) {
    const message =
      overviewFailed.error instanceof ApiError ? overviewFailed.error.message : 'Unable to load the dashboard.';
    return <ErrorState message={message} onRetry={() => overviewFailed.refetch()} />;
  }

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user?.firstName ?? ''}`.trim()}
        description="How the team and the SLA are doing, at a glance."
      />

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

      {!can(PERMISSIONS.REPORT_READ) ? null : (
        <>
          <ReportFilters value={filters} onChange={setFilters} />

          {dashboard.isPending ? (
            <LoadingState label="Loading the dashboard…" />
          ) : dashboard.isError ? (
            <ErrorState
              message={
                dashboard.error instanceof ApiError ? dashboard.error.message : 'Unable to load the dashboard.'
              }
              onRetry={() => dashboard.refetch()}
            />
          ) : (
            <>
              <section aria-label="Ticket volume" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Link href="/tickets">
                  <StatTile label="Created" value={String(dashboard.data.tickets.created)} />
                </Link>
                <Link href="/tickets">
                  <StatTile label="Resolved" value={String(dashboard.data.tickets.resolved)} />
                </Link>
                <StatTile
                  label="Open now"
                  value={String(dashboard.data.tickets.open)}
                  sub={`${dashboard.data.tickets.unassigned} unassigned`}
                  tone={dashboard.data.tickets.unassigned > 0 ? 'warning' : 'default'}
                />
                <StatTile
                  label="Overdue"
                  value={String(dashboard.data.tickets.overdue)}
                  tone={dashboard.data.tickets.overdue > 0 ? 'danger' : 'default'}
                />
                {ticketSummary.data ? (
                  <Link href="/tickets">
                    <StatTile label="Assigned to me" value={String(ticketSummary.data.assignedToMe)} />
                  </Link>
                ) : null}
              </section>

              <section aria-label="SLA and satisfaction" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatTile
                  label="Avg first response"
                  value={formatMinutes(dashboard.data.tickets.avgFirstResponseMinutes)}
                />
                <StatTile
                  label="Avg resolution"
                  value={formatMinutes(dashboard.data.tickets.avgResolutionMinutes)}
                />
                <StatTile
                  label="SLA compliance"
                  value={formatPercent(dashboard.data.sla.resolutionCompliance)}
                  sub={`${dashboard.data.sla.breachedOpen} open tickets already breached`}
                  tone={dashboard.data.sla.breachedOpen > 0 ? 'danger' : 'default'}
                />
                <StatTile
                  label="CSAT"
                  value={
                    dashboard.data.csat.average !== null ? `${dashboard.data.csat.average.toFixed(1)} / 5` : '—'
                  }
                  sub={
                    dashboard.data.csat.responses > 0
                      ? `${dashboard.data.csat.responses} responses`
                      : 'No responses yet'
                  }
                />
              </section>

              <Card>
                <CardHeader>
                  <CardTitle>Ticket volume</CardTitle>
                  <CardDescription>Created, resolved and reopened, day by day.</CardDescription>
                </CardHeader>
                <CardContent>
                  <TrendChart
                    data={dashboard.data.trend}
                    series={[
                      { key: 'created', label: 'Created', colour: '#3b82f6' },
                      { key: 'resolved', label: 'Resolved', colour: '#10b981' },
                      { key: 'reopened', label: 'Reopened', colour: '#f59e0b' },
                    ]}
                  />
                </CardContent>
              </Card>

              {dashboard.data.topAgents.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Top agents this period</CardTitle>
                    <CardDescription>By tickets resolved.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="divide-y divide-border">
                      {dashboard.data.topAgents.map((agent) => (
                        <li key={agent.agentId} className="flex items-center justify-between py-2 text-sm">
                          <span>{agent.name}</span>
                          <span className="text-muted-foreground">
                            {agent.resolved} resolved · {agent.publicReplies} replies
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ) : null}

              <p className="text-right text-xs text-muted-foreground">
                <Link href="/reports" className="underline hover:text-foreground">
                  Full reports and exports →
                </Link>
              </p>
            </>
          )}
        </>
      )}
    </>
  );
}
