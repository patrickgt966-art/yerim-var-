import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAi } from '../ai';

const KEY = 'yerim-var/ai';

async function rehydrateWith(state: Record<string, unknown>) {
  await AsyncStorage.setItem(KEY, JSON.stringify({ state, version: 1 }));
  await useAi.persist.rehydrate();
}

describe('ai store consent', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useAi.setState({ consent: 'unknown' });
  });

  it('defaults to unknown', () => {
    expect(useAi.getState().consent).toBe('unknown');
  });

  it('keeps valid persisted values', async () => {
    await rehydrateWith({ consent: 'yes' });
    expect(useAi.getState().consent).toBe('yes');
    await rehydrateWith({ consent: 'no' });
    expect(useAi.getState().consent).toBe('no');
  });

  it('falls back to unknown for corrupt values', async () => {
    await rehydrateWith({ consent: 'maybe' });
    expect(useAi.getState().consent).toBe('unknown');
    await rehydrateWith({ consent: 1 });
    expect(useAi.getState().consent).toBe('unknown');
  });

  it('persists setConsent', async () => {
    useAi.getState().setConsent('yes');
    await new Promise((r) => setTimeout(r, 0));
    const raw = await AsyncStorage.getItem(KEY);
    expect(JSON.parse(raw ?? '{}').state.consent).toBe('yes');
  });
});
