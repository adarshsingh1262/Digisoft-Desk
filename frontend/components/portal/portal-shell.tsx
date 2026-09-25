'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { portalService } from '@/services/portal.service';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { ApiError } from '@/lib/api-client';
import { usePortalSession } from './portal-session';
import { ChatWidget } from './chat-widget';

/** Header, navigation and footer for a help center, branded from its own settings. */
export function PortalShell({ slug, children }: { slug: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const session = usePortalSession();
  const config = useQuery({ queryKey: ['portal-config', slug], queryFn: () => portalService(slug).config() });

  if (config.isPending) {
    return <LoadingState label="Loading help center…" />;
  }
  if (config.isError) {
    const error = config.error;
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <div className="mx-auto max-w-lg p-10">
        <ErrorState
          message={
            missing
              ? 'This help center does not exist or is not published.'
              : error instanceof ApiError
                ? error.message
                : 'Unable to load this help center.'
          }
          onRetry={missing ? undefined : () => config.refetch()}
        />
      </div>
    );
  }

  const site = config.data;
  const base = `/help/${slug}`;
  const links = [
    { href: base, label: 'Home', show: true },
    { href: `${base}/kb`, label: 'Knowledge base', show: site.kbEnabled },
    { href: `${base}/community`, label: 'Community', show: site.communityEnabled },
    { href: `${base}/tickets`, label: 'My requests', show: session.status === 'signed-in' },
  ].filter((link) => link.show);

  return (
    <div className="flex min-h-screen flex-col bg-muted/30" style={{ ['--portal-accent' as string]: site.primaryColor }}>
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          <Link href={base} className="flex items-center gap-2">
            {site.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={site.logoUrl} alt="" className="h-7 w-auto" />
            ) : (
              <span
                className="inline-block h-6 w-6 rounded"
                style={{ backgroundColor: site.primaryColor }}
                aria-hidden
              />
            )}
            <span className="text-sm font-semibold tracking-tight">{site.name}</span>
          </Link>

          <nav aria-label="Help center" className="flex flex-wrap items-center gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={pathname === link.href ? 'page' : undefined}
                className={cn(
                  'rounded-md px-2.5 py-1.5 text-sm transition-colors',
                  pathname === link.href
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {site.allowTicketSubmission ? (
              <Button asChild size="sm" style={{ backgroundColor: site.primaryColor }}>
                <Link href={`${base}/submit`}>Submit a request</Link>
              </Button>
            ) : null}
            {session.status === 'signed-in' ? (
              <>
                <span className="hidden text-sm text-muted-foreground sm:inline">
                  {session.profile?.firstName}
                </span>
                <Button variant="ghost" size="sm" onClick={() => void session.signOut()}>
                  <LogOut className="h-4 w-4" aria-hidden />
                  Sign out
                </Button>
              </>
            ) : session.status === 'anonymous' ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`${base}/login`}>Sign in</Link>
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-6">
        {children}
      </main>

      <ChatWidget slug={slug} />

      <footer className="border-t border-border bg-background">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-muted-foreground">
          <span>{site.footerText ?? `${site.name} · powered by Digisoft360 Help Desk`}</span>
          {site.supportEmail ? <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a> : null}
        </div>
      </footer>
    </div>
  );
}
