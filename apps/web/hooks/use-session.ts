'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { refreshAccessToken } from '@/lib/api-client';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Restores a session on first paint by exchanging the http-only refresh cookie for a
 * fresh access token. Returns 'loading' until that round trip settles.
 */
export function useSessionBootstrap(): 'loading' | 'authenticated' | 'anonymous' {
  const status = useAuthStore((state) => state.status);
  const setUser = useAuthStore((state) => state.setUser);

  useEffect(() => {
    if (status !== 'loading') {
      return;
    }
    let cancelled = false;

    void (async () => {
      const token = await refreshAccessToken();
      if (cancelled) return;
      if (!token) {
        setUser(null);
        return;
      }
      try {
        const user = await authService.me();
        if (!cancelled) setUser(user);
      } catch {
        if (!cancelled) setUser(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, setUser]);

  return status;
}

/** Sends anonymous visitors to the login page once the bootstrap has settled. */
export function useRequireAuth(): 'loading' | 'authenticated' {
  const status = useSessionBootstrap();
  const router = useRouter();

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace('/login');
    }
  }, [status, router]);

  return status === 'authenticated' ? 'authenticated' : 'loading';
}
