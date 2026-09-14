'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Building2,
  LayoutDashboard,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { PERMISSIONS } from '@digisoft/shared';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { Button } from '@/components/ui/button';

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission?: string;
}

/**
 * Only shipped areas appear here. Modules from later phases are deliberately absent
 * rather than shown as links that lead nowhere.
 */
const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/customers', label: 'Customers', icon: Users, permission: PERMISSIONS.CONTACT_READ },
  { href: '/accounts', label: 'Accounts', icon: Building2, permission: PERMISSIONS.ACCOUNT_READ },
  { href: '/settings/organization', label: 'Settings', icon: Settings, permission: PERMISSIONS.ORGANIZATION_READ },
];

export function Sidebar() {
  const pathname = usePathname();
  const can = useAuthStore((state) => state.can);
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);

  const items = NAV.filter((item) => !item.permission || can(item.permission));

  return (
    <>
      {sidebarOpen ? (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-border bg-card transition-transform lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <Link href="/dashboard" className="text-sm font-semibold tracking-tight">
            Digisoft360 Help Desk
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>

        <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          Phase 1 — Foundation
        </p>
      </aside>
    </>
  );
}
