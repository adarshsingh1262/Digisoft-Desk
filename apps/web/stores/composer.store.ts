'use client';

import { create } from 'zustand';

interface ComposerState {
  /** A draft handed to the composer from elsewhere — today, the assistant's suggestion. */
  draft: { ticketId: string; body: string } | null;
  setDraft: (ticketId: string, body: string) => void;
  clearDraft: () => void;
}

/**
 * The one place a draft can be pushed into the reply box. Kept in a store rather than
 * prop-drilled so the assistant panel and the composer stay independent components.
 */
export const useComposerStore = create<ComposerState>((set) => ({
  draft: null,
  setDraft: (ticketId, body) => set({ draft: { ticketId, body } }),
  clearDraft: () => set({ draft: null }),
}));
