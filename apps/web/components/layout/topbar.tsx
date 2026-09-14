'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Bell, LogOut, Menu } from 'lucide-react';
import { authService } from '@/services/auth.service';
import { notificationsService } from '@/services/notifications.service';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { initials } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function Topbar() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const clear = useAuthStore((state) => state.clear);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);

  const { data: unread } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: notificationsService.unreadCount,
    refetchInterval: 60_000,
  });

  const signOut = async () => {
    await authService.logout().catch(() => undefined);
    clear();
    router.replace('/login');
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-3">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={toggleSidebar} aria-label="Open navigation">
        <Menu className="h-4 w-4" aria-hidden />
      </Button>

      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard" aria-label={`Notifications${unread?.count ? `, ${unread.count} unread` : ''}`}>
            <span className="relative">
              <Bell className="h-4 w-4" aria-hidden />
              {unread?.count ? (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
                  {unread.count > 9 ? '9+' : unread.count}
                </span>
              ) : null}
            </span>
          </Link>
        </Button>

        {user ? (
          <div className="flex items-center gap-2 border-l border-border pl-2">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium"
              aria-hidden
            >
              {initials(user.firstName, user.lastName)}
            </span>
            <div className="hidden text-sm leading-tight sm:block">
              <p className="font-medium">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-xs text-muted-foreground">{user.roles.join(', ')}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
              <LogOut className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
