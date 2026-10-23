import AsyncStorage from '@react-native-async-storage/async-storage';

import { dayKey } from '@/lib/nudge';

import { MUTE_MS, useNudge } from '../nudge';

const KEY = 'yerim-var/nudge';
const NOW = new Date(2026, 9, 23, 12, 0);

describe('nudge store', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useNudge.getState().reset();
  });

  it('remembers the day and kind of the last suggestion', () => {
    useNudge.getState().shown('meal', NOW);
    expect(useNudge.getState()).toMatchObject({ lastDay: dayKey(NOW), lastKind: 'meal' });
  });

  it('two "Sonra" in a row keep Yerim quiet for a week', () => {
    useNudge.getState().later(NOW);
    expect(useNudge.getState().mutedUntil).toBeNull();
    useNudge.getState().later(NOW);
    expect(useNudge.getState().mutedUntil).toBe(new Date(NOW.getTime() + MUTE_MS).toISOString());
    expect(useNudge.getState().laters).toBe(0);
  });

  it('an accepted suggestion resets the "Sonra" count', () => {
    useNudge.getState().later(NOW);
    useNudge.getState().accepted();
    useNudge.getState().later(NOW);
    expect(useNudge.getState().mutedUntil).toBeNull();
  });

  it('turning it back on lifts a mute', () => {
    useNudge.getState().later(NOW);
    useNudge.getState().later(NOW);
    useNudge.getState().setEnabled(false);
    useNudge.getState().setEnabled(true);
    expect(useNudge.getState()).toMatchObject({ enabled: true, mutedUntil: null });
  });

  it('keeps only well-formed values from storage', async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        state: {
          enabled: 'no',
          lastDay: 'yesterday',
          lastKind: 'spam',
          mutedUntil: 'x',
          laters: 7,
        },
        version: 1,
      }),
    );
    await useNudge.persist.rehydrate();
    expect(useNudge.getState()).toMatchObject({
      enabled: true,
      lastDay: null,
      lastKind: null,
      mutedUntil: null,
      laters: 0,
    });
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        state: { enabled: false, lastDay: '2026-10-22', lastKind: 'meal' },
        version: 1,
      }),
    );
    await useNudge.persist.rehydrate();
    expect(useNudge.getState()).toMatchObject({
      enabled: false,
      lastDay: '2026-10-22',
      lastKind: 'meal',
    });
  });
});
