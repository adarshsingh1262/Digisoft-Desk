'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { refreshAccessToken, setAccessToken } from '@/lib/api-client';
import { authService } from '@/services/auth.service';
import { portalService } from '@/services/portal.service';
import type { PortalProfile } from '@/types/api';

interface PortalSession {
  slug: string;
  profile: PortalProfile | null;
  status: 'loading' | 'signed-in' | 'anonymous';
  signedIn: (accessToken: string) => Promise<void>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
}

const PortalSessionContext = createContext<PortalSession | null>(null);

/**
 * Restores a customer session from the same http-only refresh cookie the agent app
 * uses, then keeps the profile in memory. The access token is never persisted.
 */
export function PortalSessionProvider({ slug, children }: { slug: string; children: React.ReactNode }) {
  const [profile, setProfile] = useState<PortalProfile | null>(null);
  const [status, setStatus] = useState<'loading' | 'signed-in' | 'anonymous'>('loading');

  const load = useCallback(async () => {
    try {
      const me = await portalService(slug).me();
      setProfile(me);
      setStatus('signed-in');
    } catch {
      setProfile(null);
      setStatus('anonymous');
    }
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const token = await refreshAccessToken();
      if (cancelled) return;
      if (!token) {
        setStatus('anonymous');
        return;
      }
      await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const value = useMemo<PortalSession>(
    () => ({
      slug,
      profile,
      status,
      signedIn: async (accessToken: string) => {
        setAccessToken(accessToken);
        await load();
      },
      signOut: async () => {
        await authService.logout().catch(() => undefined);
        setAccessToken(null);
        setProfile(null);
        setStatus('anonymous');
      },
      reload: load,
    }),
    [slug, profile, status, load],
  );

  return <PortalSessionContext.Provider value={value}>{children}</PortalSessionContext.Provider>;
}

export function usePortalSession(): PortalSession {
  const session = useContext(PortalSessionContext);
  if (!session) {
    throw new Error('usePortalSession used outside the help center');
  }
  return session;
}
