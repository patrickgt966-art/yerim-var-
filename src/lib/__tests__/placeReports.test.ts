// Reports: kept on the device at once, sent anonymously, and the server's hidden list filters
// the restaurants and car parks.

import { allRestaurants, getRestaurant } from '@/data/restaurants';
import { addStatic } from '@/data/useParkings';
import { refreshHiddenPlaces, sendPlaceReport } from '@/lib/placeReports';
import { useAi } from '@/store/ai';
import { hiddenPlaceIds, useReports } from '@/store/reports';

// Hoisted above the imports by babel-jest.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { aiUrl: 'https://ai.test/' } } },
}));

const reply = (body: unknown, ok = true) =>
  jest.fn(async () => ({ ok, json: async () => body }) as unknown as Response);

beforeEach(() => useReports.setState({ mine: {}, server: {} }));

describe('sendPlaceReport', () => {
  it('posts the place, reason, city and device id, and keeps the report', async () => {
    const f = reply({ ok: true, hidden: false });
    expect(await sendPlaceReport('osm-n1', 'food', 'closed', f as unknown as typeof fetch)).toBe(
      true,
    );
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://ai.test/report');
    expect(JSON.parse(String(init.body))).toEqual({
      deviceId: useAi.getState().deviceId,
      placeId: 'osm-n1',
      place: 'food',
      kind: 'closed',
      city: 'izmir',
    });
    expect(hiddenPlaceIds().has('osm-n1')).toBe(true);
  });

  it('keeps the report on the device when the server is unreachable', async () => {
    const f = jest.fn(async () => {
      throw new Error('offline');
    });
    expect(await sendPlaceReport('osm-n2', 'parking', 'info', f as unknown as typeof fetch)).toBe(
      false,
    );
    expect(useReports.getState().mine['osm-n2']?.kind).toBe('info');
    // Only "closed" hides.
    expect(hiddenPlaceIds().has('osm-n2')).toBe(false);
  });
});

describe('refreshHiddenPlaces', () => {
  it('stores the ids and waits hours before fetching again', async () => {
    const f = reply({ city: 'izmir', ids: ['a', 'b', 3] });
    await refreshHiddenPlaces('izmir', { fetchImpl: f as unknown as typeof fetch });
    expect(useReports.getState().server.izmir?.ids).toEqual(['a', 'b']);
    await refreshHiddenPlaces('izmir', { fetchImpl: f as unknown as typeof fetch });
    expect(f).toHaveBeenCalledTimes(1);
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe('https://ai.test/hidden?city=izmir');
  });

  it('keeps the old list when the fetch fails', async () => {
    useReports.getState().setServer('izmir', ['a'], 0);
    await refreshHiddenPlaces('izmir', { fetchImpl: reply({}, false) as unknown as typeof fetch });
    expect(useReports.getState().server.izmir?.ids).toEqual(['a']);
  });
});

describe('hidden places in the data', () => {
  it('leaves a hidden restaurant out of the lists but still opens it', () => {
    const first = allRestaurants()[0]!;
    useReports.getState().setServer('izmir', [first.id]);
    expect(allRestaurants().some((r) => r.id === first.id)).toBe(false);
    expect(getRestaurant(first.id)?.id).toBe(first.id);
    useReports.getState().setServer('izmir', []);
    expect(allRestaurants()[0]!.id).toBe(first.id);
  });

  it('leaves a car park reported closed out', () => {
    const result = {
      parkings: [],
      source: 'static-only' as const,
      fetchedAt: '2026-01-01T00:00:00Z',
    };
    const before = addStatic(result).parkings;
    const gone = before[0]!.id;
    useReports.getState().addMine(gone, 'closed');
    expect(addStatic(result).parkings.some((p) => p.id === gone)).toBe(false);
    useReports.getState().removeMine(gone);
    expect(addStatic(result).parkings.length).toBe(before.length);
  });
});
