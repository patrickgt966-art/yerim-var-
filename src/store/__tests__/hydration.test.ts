import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook } from '@testing-library/react-native';

import { didHydrationFail, safeJSONStorage, useApp } from '../app';
import { useHydrated } from '../useHydrated';

const KEY = 'yerim-var/app';

afterEach(async () => {
  jest.restoreAllMocks();
  await AsyncStorage.clear();
});

describe('hydration never leaves the app on the splash screen', () => {
  it('starts with the defaults when the stored value is truncated JSON', async () => {
    await AsyncStorage.setItem(KEY, '{"state":{"onboarded":tru');
    useApp.setState({ onboarded: false });
    await useApp.persist.rehydrate();
    expect(useApp.persist.hasHydrated()).toBe(true);
    expect(useApp.getState().onboarded).toBe(false);
    // The corrupt value is dropped, so the next launch does not hit it again.
    expect(await AsyncStorage.getItem(KEY)).not.toBe('{"state":{"onboarded":tru');
  });

  it('starts with the defaults when AsyncStorage cannot be read', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('io'));
    await useApp.persist.rehydrate();
    expect(useApp.persist.hasHydrated()).toBe(true);
  });

  it('finishes hydration when the migration write fails (full disk)', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ state: { onboarded: true }, version: 1 }));
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('full'));
    await useApp.persist.rehydrate();
    expect(useApp.persist.hasHydrated()).toBe(true);
    expect(useApp.getState().onboarded).toBe(true);
  });

  it('reports hydrated once hydration fails for any other reason', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ state: { onboarded: true }, version: 1 }));
    const persist = useApp.persist as unknown as {
      getOptions: () => { migrate: unknown };
      setOptions: (o: object) => void;
    };
    const original = persist.getOptions().migrate;
    persist.setOptions({
      migrate: () => {
        throw new Error('bad migration');
      },
    });
    try {
      await useApp.persist.rehydrate();
    } finally {
      persist.setOptions({ migrate: original });
    }
    expect(didHydrationFail()).toBe(true);
    const { result } = await renderHook(() => useHydrated());
    expect(result.current).toBe(true);
  });

  it('swallows a failed write', async () => {
    const storage = safeJSONStorage<{ a: number }>(() => ({
      getItem: () => null,
      setItem: () => Promise.reject(new Error('full')),
      removeItem: () => undefined,
    }));
    await expect(storage.setItem('k', { state: { a: 1 }, version: 0 })).resolves.toBeUndefined();
  });
});
