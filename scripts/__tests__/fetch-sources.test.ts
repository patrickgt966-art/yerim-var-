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
const { cities, tiles, tiled } = runInNewContext(
  `${definitions}\noverpassDeadline = Infinity;\n({ cities: CITIES, tiles: makeTiles, tiled: overpassTiled })`,
  ctx,
) as {
  cities: { id: string; tiled?: Config }[];
  tiles: (cfg: Config) => Box[];
  tiled: (city: unknown, query: unknown, label: string) => Promise<unknown>;
};

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
