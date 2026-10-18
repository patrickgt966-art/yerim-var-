import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';

import { cityById } from '../../src/data/cities';

type Box = { s: number; w: number; n: number; e: number };
type Config = { bbox: Box; rows: number; cols: number; skip?: (box: Box) => boolean };

// Execute the script's actual definitions without its network/filesystem main routine.
const script = path.resolve(__dirname, '../fetch-sources.mjs');
const definitions = readFileSync(script, 'utf8')
  .split('// --- main ---')[0]!
  .replace(/^import .*;\n/gm, '')
  .replace('import.meta.url', 'scriptUrl');
const ctx = {
  path,
  fileURLToPath,
  scriptUrl: pathToFileURL(script).href,
  process: { env: {}, argv: [] },
  console,
  AbortController,
  setTimeout,
  clearTimeout,
  fetch: jest.fn(),
};
const { cities, tiles, tiled, food, mergeCapacity, izmirTariffs } = runInNewContext(
  `${definitions}\noverpassDeadline = Infinity;\n({ cities: CITIES, tiles: makeTiles, tiled: overpassTiled, food: fromFood, mergeCapacity, izmirTariffs })`,
  ctx,
) as {
  mergeCapacity: (
    osm: Record<string, unknown>[],
    muni: Record<string, unknown>[],
  ) => { osm: Record<string, unknown>[]; extra: Record<string, unknown>[]; matched: number };
  izmirTariffs: (
    rows: Record<string, unknown>[],
    parkings: Record<string, unknown>[],
    at: string,
  ) => Record<string, unknown>[];
  cities: { id: string; tiled?: Config }[];
  tiles: (cfg: Config) => Box[];
  tiled: (city: unknown, query: unknown, label: string) => Promise<unknown>;
  food: (el: unknown) => Record<string, unknown> | null;
};

it('keeps diet tags: "only" (or the cuisine) as the diet, "yes" as an option', () => {
  const el = (tags: Record<string, string>) => ({
    type: 'node',
    id: 1,
    lat: 38.4,
    lon: 27.1,
    tags: { name: 'X', amenity: 'restaurant', ...tags },
  });
  expect(food(el({ 'diet:vegan': 'only' }))!.dt).toEqual(['vegan']);
  expect(food(el({ 'diet:vegetarian': 'yes', 'diet:gluten_free': 'yes' }))!.dt).toEqual([
    'vegetarian_options',
    'gluten_free_options',
  ]);
  expect(food(el({ cuisine: 'vegetarian;turkish' }))!.dt).toEqual(['vegetarian']);
  expect(food(el({ 'diet:pescetarian': 'yes' }))!.dt).toEqual(['pescetarian_options']);
  expect(food(el({ 'diet:vegan': 'no' }))).not.toHaveProperty('dt');
  // Halal is left out: in Türkiye nearly every place is.
  expect(food(el({ 'diet:halal': 'only' }))).not.toHaveProperty('dt');
});

it('includes every Ankara district centre in the tiled places/food scan', () => {
  const config = cities.find((city) => city.id === 'ankara')!.tiled!;
  const boxes = tiles(config);
  const missing = cityById('ankara').districtCenters.filter(
    (point) =>
      !boxes.some(
        (box) =>
          point.lat >= box.s && point.lat <= box.n && point.lng >= box.w && point.lng <= box.e,
      ),
  );
  expect(missing.map((point) => point.name)).toEqual([]);
});

it.each([false, true])('keeps an incomplete tile group (optional=%s) from replacing a complete file', async (optional) => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  try {
    let calls = 0;
    ctx.fetch.mockImplementation(async () =>
      ++calls <= 3
        ? { ok: true, json: async () => ({ elements: [{ type: 'node', id: calls }] }) }
        : { ok: false, status: 503 },
    );
    // Three of four tiles pass both the 50% tile threshold and the 70% count guard;
    // the fourth tile and all its quarters fail. Its existing records must survive.
    const city = {
      name: 'Ankara',
      tiled: {
        bbox: { s: 38, w: 31, n: 41, e: 34 },
        rows: 2,
        cols: 2,
        minOk: 0.5,
        rounds: 1,
        gapMs: 0,
        timeout: 10,
        httpMs: 100,
      },
    };
    const result = await tiled(city, { tiled: [{ statements: 'node(area.city);', optional }] }, 'food');
    expect(result).toBeNull();
  } finally {
    warn.mockRestore();
    log.mockRestore();
  }
});

describe('municipal and price-list merges', () => {
  const plain = (x: unknown) => JSON.parse(JSON.stringify(x));

  it('adds a municipal capacity to the nearest OSM car park and drops nothing', () => {
    const garage = { id: 'osm-way-1', name: 'X Katlı Otopark', lat: 40.19, lng: 29.06, capacity: null, isPaid: true };
    const lot = { id: 'osm-way-2', name: null, lat: 40.1905, lng: 29.06, capacity: 20, isPaid: null };
    const point = { id: 'bursa-bb-1', name: null, lat: 40.19001, lng: 29.06, capacity: 400 };
    const far = { id: 'bursa-bb-2', name: null, lat: 40.2, lng: 29.1, capacity: 50 };
    const r = plain(mergeCapacity([garage, lot], [point, far]));
    expect(r.osm).toEqual([{ ...garage, capacity: 400 }, lot]);
    expect(r.extra.map((z: { id: string }) => z.id)).toEqual(['bursa-bb-2']);
  });

  it('maps İzmir price rows to one İzelman car park each, car columns only', () => {
    const parkings = [
      { id: 'izelman-a', name: 'Alsancak Punta Otoparkı', source: 'izelman' },
      { id: 'izelman-b', name: 'Hatay Pazar Yeri Katlı Otoparkı', source: 'izelman' },
      { id: 'izelman-c', name: 'Alsancak Devlet Hastanesi Yol Kenarı Otoparkı', source: 'izelman' },
      { id: 'osm-x', name: 'Üçkuyular İskele Otoparkı', source: 'osm' },
    ];
    const rows = [
      {
        'Otopark / Fiyat': 'Alsancak Punta Katlı Otoparkı',
        '0-2 saat': 150,
        '12-24 saat': 300,
        '0-12 Saat(Motosiklet )': 60,
        'Kayıp Bilet': 300,
        'Aylık Abone Ücreti': 7500,
      },
      { 'Otopark / Fiyat': 'Hatay Pazaryeri Katlı Otoparkı', '0-1 Saat': 30, '1-12 saat': 100 },
      { 'Otopark / Fiyat': 'Üçkuyular İskele Otoparkı', '0-2 saat': 50 },
      { 'Otopark / Fiyat': 'Göztepe Katlı Otoparkı', 'Aylık Abone Ücreti': 3000 },
    ];
    const out = plain(izmirTariffs(rows, parkings, '2026-02-16'));
    expect(out.map((t: { parkingId: string }) => t.parkingId)).toEqual(['izelman-a', 'izelman-b']);
    expect(out[0]).toMatchObject({
      bands: [
        { label: '0-2 Saat', price: 150 },
        { label: '12-24 Saat', price: 300 },
      ],
      hourly: null,
      monthly: 7500,
      priceKind: 'official',
      verifiedAt: '2026-02-16',
    });
    expect(out[1]).toMatchObject({ hourly: 30 });
  });
});
