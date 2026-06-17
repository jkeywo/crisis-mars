// Online/offline state. Spec section 23 requires a clear offline banner and that
// players can still read cached rules/briefs while offline.

import { readable, type Readable } from 'svelte/store';
import { browser } from '$app/environment';

export const isOnline: Readable<boolean> = readable(true, (set) => {
  if (!browser) return;
  set(navigator.onLine);
  const onOnline = () => set(true);
  const onOffline = () => set(false);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
});
