import { IsparkProvider, ISPARK_PARKING_URL, normalizeIspark } from '../isparkProvider';
import { SchemaDriftError } from '../izmirProvider';

import sample from './fixtures/ispark-sample.json';

// The record shape is DOCUMENTED (from open-source clients of
// https://api.ibb.gov.tr/ispark/Park), not verified against a live response:
// the fixture is hand-written, not a capture. Re-check on a device.

const at = '2026-10-14T09:00:00.000Z';
const byId = (id: string) => normalizeIspark(sample, at).find((p) => p.id === id);

describe('normalizeIspark', () => {
  it('maps a documented record and coerces string numbers', () => {
    expect(byId('ispark-101')).toMatchObject({
      name: 'KADIKÖY ÇARŞI KATLI OTOPARKI',
      lat: 40.9903,
      lng: 29.0245,
      capacity: 220,
      free: 37,
      isIndoor: true,
      isOpen: true,
      isPaid: true,
      nonstop: true,
      openingHours: null,
      address: 'Kadıköy',
      operator: 'İSPARK',
      source: 'ispark',
      updatedAt: null,
      fetchedAt: at,
      occupancyKind: 'estimated',
    });
    expect(byId('ispark-102')).toMatchObject({
      capacity: 80,
      free: 0,
      isIndoor: null,
      isOpen: true,
      nonstop: null,
      openingHoursText: '08:00-20:00',
    });
  });

  it('keeps a null emptyCapacity as unknown occupancy and 0 capacity as unknown', () => {
    expect(byId('ispark-103')).toMatchObject({
      capacity: null,
      free: null,
      isOpen: false,
      // Not a plain range: unreadable hours stay unknown, never guessed.
      openingHoursText: null,
    });
  });

  it('accepts comma decimals and any case of the closed type', () => {
    const p = byId('ispark-104');
    expect(p).toMatchObject({ lat: 41.1687, lng: 29.0572, isIndoor: true });
  });

  it('treats more free bays than bays as unknown', () => {
    expect(byId('ispark-104')?.free).toBeNull();
    expect(byId('ispark-104')?.capacity).toBe(120);
  });

  it('drops the malformed record and keeps the rest', () => {
    expect(normalizeIspark(sample, at).map((p) => p.id)).toEqual([
      'ispark-101',
      'ispark-102',
      'ispark-103',
      'ispark-104',
    ]);
  });

  it('keeps the first of a duplicate id and drops a (0, 0) point', () => {
    const rec = sample[0]!;
    const out = normalizeIspark(
      [rec, { ...rec, parkName: 'copy' }, { ...rec, parkID: 9, lat: 0, lng: '0' }, sample[1]],
      at,
    );
    expect(out.map((p) => [p.id, p.name])).toEqual([
      ['ispark-101', 'KADIKÖY ÇARŞI KATLI OTOPARKI'],
      ['ispark-102', 'Beşiktaş Barbaros Açık Otopark'],
    ]);
  });

  it('tolerates a malformed optional field without dropping the record', () => {
    const [p] = normalizeIspark(
      [{ ...sample[0], emptyCapacity: 'many', workHours: 5, isOpen: {} }],
      at,
    );
    expect(p).toMatchObject({ id: 'ispark-101', free: null, isOpen: null, nonstop: null });
  });

  it('throws on schema drift', () => {
    expect(() => normalizeIspark({ data: [] }, at)).toThrow(SchemaDriftError);
    expect(() => normalizeIspark([], at)).toThrow(SchemaDriftError);
    expect(() => normalizeIspark([{ id: 1, name: 'x' }], at)).toThrow(SchemaDriftError);
    // Most records invalid: the schema changed under us.
    expect(() =>
      normalizeIspark([sample[0], { ...sample[1], lat: 'x' }, { ...sample[2], lat: 'y' }], at),
    ).toThrow(SchemaDriftError);
  });
});

describe('IsparkProvider', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('GETs the endpoint without credentials and normalizes the answer', async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, status: 200, json: async () => sample }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const list = await new IsparkProvider().list();
    expect(list).toHaveLength(4);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(ISPARK_PARKING_URL);
    expect(init.headers).toEqual({ Accept: 'application/json' });
  });

  it('fails on an HTTP error so the repository can fall back', async () => {
    globalThis.fetch = jest.fn(async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
    await expect(new IsparkProvider().list()).rejects.toThrow('HTTP 503');
  });
});
