'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PERMISSIONS } from '@digisoft/shared';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import { PageHeader } from '@/components/layout/page-header';

const TABS = [
  { href: '/settings/organization', label: 'Organization', permission: PERMISSIONS.ORGANIZATION_READ },
  { href: '/settings/users', label: 'Agents', permission: PERMISSIONS.USER_READ },
  { href: '/settings/roles', label: 'Roles', permission: PERMISSIONS.ROLE_READ },
  { href: '/settings/departments', label: 'Departments', permission: PERMISSIONS.DEPARTMENT_READ },
  { href: '/settings/teams', label: 'Teams', permission: PERMISSIONS.TEAM_READ },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const can = useAuthStore((state) => state.can);
  const tabs = TABS.filter((tab) => can(tab.permission));

  return (
    <>
      <PageHeader title="Settings" description="Configure this organization and who works in it." />
      <nav aria-label="Settings sections" className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                '-mb-px border-b-2 px-3 py-2 text-sm transition-colors',
                active
                  ? 'border-foreground font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <div className="space-y-4">{children}</div>
    </>
  );
}
