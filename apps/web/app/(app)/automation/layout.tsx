'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';

const TABS = [
  { href: '/automation/rules', label: 'Workflow rules' },
  { href: '/automation/escalations', label: 'Escalations' },
  { href: '/automation/assignment', label: 'Assignment' },
  { href: '/automation/sla', label: 'SLA policies' },
  { href: '/automation/blueprints', label: 'Blueprints' },
];

export default function AutomationLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <>
      <PageHeader title="Automation" description="Rules that route, escalate, time and govern tickets without an agent lifting a finger." />
      <nav aria-label="Automation sections" className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link key={tab.href} href={tab.href} aria-current={active ? 'page' : undefined}
              className={cn('-mb-px border-b-2 px-3 py-2 text-sm transition-colors', active ? 'border-foreground font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <div className="space-y-4">{children}</div>
    </>
  );
}
