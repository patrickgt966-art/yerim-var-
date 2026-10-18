import { useSyncExternalStore } from 'react';

import { didHydrationFail, onHydrationFail, useApp } from './app';

const subscribe = (cb: () => void) => {
  const offDone = useApp.persist.onFinishHydration(cb);
  const offFail = onHydrationFail(cb);
  return () => {
    offDone();
    offFail();
  };
};
const get = () => useApp.persist.hasHydrated() || didHydrationFail();

/**
 * True once the persisted store has been read from AsyncStorage, or once reading it failed (the
 * app then continues with the default state rather than waiting on the splash screen).
 */
export function useHydrated() {
  return useSyncExternalStore(subscribe, get, get);
}
