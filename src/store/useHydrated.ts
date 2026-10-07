import { useSyncExternalStore } from 'react';

import { useApp } from './app';

const subscribe = (cb: () => void) => useApp.persist.onFinishHydration(cb);
const get = () => useApp.persist.hasHydrated();

/** True once the persisted store has been read from AsyncStorage. */
export function useHydrated() {
  return useSyncExternalStore(subscribe, get, get);
}
