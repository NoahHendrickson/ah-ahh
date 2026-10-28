import { useSyncExternalStore } from 'react';

// The computer account's name and picture, shared by the sidebar and the Profile page.
let current: AhAhhProfile | undefined;
let requested = false;
const listeners = new Set<() => void>();

/** Reads it again. The Profile page does when it opens, so a changed name or picture shows up everywhere. */
export function refreshProfile(): void {
  requested = true;
  window.ahahh?.getProfile().then(
    (profile) => {
      current = profile;
      for (const listener of listeners) listener();
    },
    (err) => console.warn('Could not read the profile:', err),
  );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!requested) refreshProfile();
  return () => void listeners.delete(listener);
}

export function useProfile(): AhAhhProfile | undefined {
  return useSyncExternalStore(subscribe, () => current);
}
