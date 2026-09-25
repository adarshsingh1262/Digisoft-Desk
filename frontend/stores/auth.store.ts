'use client';

import { create } from 'zustand';
import type { AuthenticatedUser } from '@digisoft/shared';
import { setAccessToken } from '@/lib/api-client';

interface AuthState {
  user: AuthenticatedUser | null;
  status: 'loading' | 'authenticated' | 'anonymous';
  setSession: (user: AuthenticatedUser, accessToken: string) => void;
  setUser: (user: AuthenticatedUser | null) => void;
  clear: () => void;
  can: (permission: string) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  status: 'loading',
  setSession: (user, accessToken) => {
    setAccessToken(accessToken);
    set({ user, status: 'authenticated' });
  },
  setUser: (user) => set({ user, status: user ? 'authenticated' : 'anonymous' }),
  clear: () => {
    setAccessToken(null);
    set({ user: null, status: 'anonymous' });
  },
  /** Mirrors the backend guard; the backend remains the authority. */
  can: (permission) => get().user?.permissions.includes(permission) ?? false,
}));
