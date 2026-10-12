import { useAi } from '@/store/ai';

import { noteAiActivity, refreshAiQuota, resetAiRefresh } from '../refresh';

let mockAiUrl: string | undefined;
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: { aiUrl: mockAiUrl } };
    },
  },
}));

const mockFetch = (status: number, body: unknown) => {
  const f = jest.fn(async () => ({ status, ok: status < 300, json: async () => body }));
  global.fetch = f as unknown as typeof fetch;
  return f;
};

beforeEach(() => {
  mockAiUrl = 'https://ai.test';
  resetAiRefresh();
  useAi.setState({ consent: 'yes', deviceId: 'd-test', day: '', used: 0 });
});

describe('refreshAiQuota', () => {
  it('stores the server count', async () => {
    const f = mockFetch(200, { remaining: 2 });
    await refreshAiQuota();
    expect(useAi.getState().remaining()).toBe(2);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('is throttled unless forced', async () => {
    const f = mockFetch(200, { remaining: 2 });
    await refreshAiQuota();
    await refreshAiQuota();
    expect(f).toHaveBeenCalledTimes(1);
    await refreshAiQuota({ force: true });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('does nothing without consent or a server url', async () => {
    const f = mockFetch(200, { remaining: 2 });
    useAi.setState({ consent: 'unknown' });
    await refreshAiQuota();
    useAi.setState({ consent: 'yes' });
    mockAiUrl = undefined;
    await refreshAiQuota();
    expect(f).not.toHaveBeenCalled();
  });

  it('leaves the store alone on an older server (404)', async () => {
    mockFetch(404, {});
    await refreshAiQuota();
    expect(useAi.getState().remaining()).toBe(5);
  });

  it('drops a read that an AI response overtook', async () => {
    let release: (v: unknown) => void = () => {};
    global.fetch = jest.fn(
      () => new Promise((resolve) => (release = resolve)),
    ) as unknown as typeof fetch;
    const p = refreshAiQuota();
    useAi.getState().setRemaining(3);
    noteAiActivity();
    release({ status: 200, ok: true, json: async () => ({ remaining: 5 }) });
    await p;
    expect(useAi.getState().remaining()).toBe(3);
  });
});
