import { IzmirOpenDataProvider, normalizeIzmir, SchemaDriftError } from '../izmirProvider';

import live from './fixtures/izmir-live-2026-10-07.json';

const sample = {
  ufid: 'NEDAP-TR-IZM-006',
  name: '06 1393 Sk. Yol Kenarı Otopark ',
  provider: 'İZELMAN A.Ş',
  type: 'OnStreet',
  status: 'Opened',
  lat: 38.432968,
  lng: 27.145272,
  address: '',
  isPaid: true,
  nonstop: false,
  openingHours: { monday: '07:00 – 22:00', holiday: 'x' },
  occupancy: { total: { free: 1, occupied: 60 } },
  accessories: { covered: false, barrier: false, cctv: false },
};

const at = '2026-10-07T12:00:00.000Z';

describe('normalizeIzmir', () => {
  it('maps a documented record', () => {
    const [r] = normalizeIzmir([sample], at);
    expect(r).toMatchObject({
      id: 'NEDAP-TR-IZM-006',
      name: '06 1393 Sk. Yol Kenarı Otopark',
      capacity: 61,
      free: 1,
      isIndoor: null,
      isOpen: true,
      address: null,
      source: 'izmir-open-data',
      updatedAt: null,
      fetchedAt: at,
      occupancyKind: 'estimated',
      openingHours: { monday: '07:00 – 22:00' },
    });
  });

  it('drops invalid records and keeps the rest', () => {
    const bad = [
      { ...sample, ufid: '' },
      { ...sample, ufid: 'b', lat: Number.NaN },
      { ...sample, ufid: 'c', occupancy: { total: { free: -1, occupied: 3 } } },
    ];
    const good = ['ok1', 'ok2', 'ok3', 'ok4'].map((ufid) => ({ ...sample, ufid }));
    const out = normalizeIzmir([...bad, ...good], at);
    expect(out.map((p) => p.id)).toEqual(['ok1', 'ok2', 'ok3', 'ok4']);
  });

  it('leaves capacity unknown when a count is missing', () => {
    const [r] = normalizeIzmir([{ ...sample, occupancy: { total: { free: 5 } } }], at);
    expect(r?.capacity).toBeNull();
    expect(r?.free).toBe(5);
  });

  it('throws on schema drift', () => {
    expect(() => normalizeIzmir({ data: [] }, at)).toThrow(SchemaDriftError);
    expect(() => normalizeIzmir([{ id: 1, title: 'x' }], at)).toThrow(SchemaDriftError);
  });

  it('treats an empty or mostly invalid response as an outage', () => {
    // Otherwise it would overwrite the last good result saved on the device.
    expect(() => normalizeIzmir([], at)).toThrow('Boş yanıt');
    const broken = [1, 2, 3].map((i) => ({ ...sample, ufid: `b${i}`, name: null }));
    expect(() => normalizeIzmir([...broken, sample], at)).toThrow('Kayıtların çoğu geçersiz');
  });

  it('parses a real API response (2026-10-07)', () => {
    const out = normalizeIzmir(live, at);
    expect(out).toHaveLength(live.length);
    const konak = out.find((p) => p.id === 'CPS-TR-IZM-M1-01');
    expect(konak).toMatchObject({ capacity: 888, free: 661, nonstop: true, isPaid: true });
    // "–" placeholders for nonstop parks are not opening hours.
    expect(konak?.openingHours).toBeNull();
    // covered:false is unreliable for a multi-storey car park.
    expect(konak?.isIndoor).toBeNull();
    expect(out.every((p) => p.updatedAt === null && p.occupancyKind === 'estimated')).toBe(true);
  });
});

describe('normalizeIzmir hardening', () => {
  const pad = ['p1', 'p2', 'p3'].map((ufid) => ({ ...sample, ufid }));

  it('drops blank and whitespace-only names', () => {
    const out = normalizeIzmir([{ ...sample, ufid: 'b1', name: '   ' }, ...pad], at);
    expect(out.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });
  it('keeps the first of duplicate ids', () => {
    const out = normalizeIzmir([{ ...sample, ufid: 'p1', name: 'Second' }, ...pad, pad[0]], at);
    expect(out.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(out[0]?.name).toBe('Second');
  });
  it('treats non-integer counts as unknown but keeps the record', () => {
    const [r] = normalizeIzmir(
      [{ ...sample, occupancy: { total: { free: 2.5, occupied: 10 } } }, ...pad],
      at,
    );
    expect(r?.free).toBeNull();
    expect(r?.capacity).toBeNull();
  });
  it('caps the name length', () => {
    const [r] = normalizeIzmir([{ ...sample, name: 'x'.repeat(500) }], at);
    expect(r?.name).toHaveLength(120);
  });
});

describe('IzmirOpenDataProvider', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('reports a timeout by name', async () => {
    globalThis.fetch = jest.fn(
      (_url: unknown, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
        }),
    ) as unknown as typeof fetch;
    const provider = new IzmirOpenDataProvider('https://example.test', 10);
    await expect(provider.list()).rejects.toThrow('Zaman aşımı');
  });
});
