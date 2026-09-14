'use client';

import { useEffect, useState } from 'react';

/**
 * True once the client has hydrated. Password forms keep their submit button
 * disabled until then: a native submit on an un-hydrated form would navigate with
 * the credentials appended to the URL, leaving them in history and server logs.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
