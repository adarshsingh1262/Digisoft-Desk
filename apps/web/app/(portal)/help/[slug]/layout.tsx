'use client';

import { use } from 'react';
import { PortalSessionProvider } from '@/components/portal/portal-session';
import { PortalShell } from '@/components/portal/portal-shell';

export default function HelpCenterLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return (
    <PortalSessionProvider slug={slug}>
      <PortalShell slug={slug}>{children}</PortalShell>
    </PortalSessionProvider>
  );
}
