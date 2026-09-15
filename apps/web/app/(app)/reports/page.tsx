'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PERMISSIONS, type ReportKind } from '@digisoft/shared';
import { useAuthStore } from '@/stores/auth.store';
import { PageHeader } from '@/components/layout/page-header';
import { ReportFilters, toQuery, type ReportFilterValue } from '@/components/reports/report-filters';
import { cn } from '@/lib/utils';
import { TicketsReportTab } from '@/components/reports/tickets-report-tab';
import { AgentsReportTab } from '@/components/reports/agents-report-tab';
import { SlaReportTab } from '@/components/reports/sla-report-tab';
import { CsatReportTab } from '@/components/reports/csat-report-tab';
import { ExportsPanel } from '@/components/reports/exports-panel';
import { SavedReports } from '@/components/reports/saved-reports';
import { Card, CardContent } from '@/components/ui/card';

type Tab = ReportKind | 'EXPORTS';

const TABS: { key: Tab; label: string }[] = [
  { key: 'TICKETS', label: 'Tickets' },
  { key: 'AGENTS', label: 'Agents' },
  { key: 'SLA', label: 'SLA' },
  { key: 'CSAT', label: 'CSAT' },
  { key: 'EXPORTS', label: 'Exports' },
];

export default function ReportsPage() {
  const can = useAuthStore((state) => state.can);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('TICKETS');
  const [filters, setFilters] = useState<ReportFilterValue>({ range: '30d' });

  if (!can(PERMISSIONS.REPORT_READ)) {
    return (
      <>
        <PageHeader title="Reports" description="Ticket, agent, SLA and satisfaction reporting." />
        <Card>
          <CardContent className="pt-4 text-sm text-muted-foreground">
            Your role does not include report access.
          </CardContent>
        </Card>
      </>
    );
  }

  const query = toQuery(filters);

  return (
    <>
      <PageHeader title="Reports" description="Ticket, agent, SLA and satisfaction reporting." />

      <div role="tablist" aria-label="Report sections" className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm transition-colors',
              tab === item.key
                ? 'border-foreground font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab !== 'EXPORTS' ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <ReportFilters value={filters} onChange={setFilters} />
          <SavedReports kind={tab} filters={filters} onLoad={setFilters} />
        </div>
      ) : null}

      {tab === 'TICKETS' ? <TicketsReportTab query={query} /> : null}
      {tab === 'AGENTS' ? <AgentsReportTab query={query} /> : null}
      {tab === 'SLA' ? <SlaReportTab query={query} /> : null}
      {tab === 'CSAT' ? <CsatReportTab query={query} /> : null}
      {tab === 'EXPORTS' ? (
        <ExportsPanel
          currentFilters={filters}
          onExported={() => queryClient.invalidateQueries({ queryKey: ['report-exports'] })}
        />
      ) : null}
    </>
  );
}
