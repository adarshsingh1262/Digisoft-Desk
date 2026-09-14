'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:4000';

const TICKET_EVENTS = [
  'ticket.created',
  'ticket.updated',
  'ticket.assigned',
  'ticket.status_changed',
  'message.created',
] as const;

/**
 * Keeps the workspace live. The server only sends events for tickets this user may
 * read, and each event invalidates the matching queries rather than patching caches by
 * hand — the API stays the single source of truth.
 */
export function useRealtime(): void {
  const queryClient = useQueryClient();
  const status = useAuthStore((state) => state.status);

  useEffect(() => {
    if (status !== 'authenticated') {
      return;
    }
    const token = getAccessToken();
    if (!token) {
      return;
    }

    const socket: Socket = io(`${SOCKET_URL}/rt`, {
      auth: { token },
      transports: ['websocket'],
      withCredentials: true,
    });

    for (const event of TICKET_EVENTS) {
      socket.on(event, (payload: { id?: string; ticketId?: string }) => {
        const ticketId = payload?.ticketId ?? payload?.id;
        void queryClient.invalidateQueries({ queryKey: ['tickets'] });
        if (ticketId) {
          void queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
        }
      });
    }

    socket.on('notification.created', () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });

    return () => {
      socket.close();
    };
  }, [status, queryClient]);
}
