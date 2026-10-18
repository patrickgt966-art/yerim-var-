import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';

// Execute the script's parsing definitions without its network/filesystem main routine.
const script = path.resolve(__dirname, '../fetch-ispark-tariffs.mjs');
const definitions = readFileSync(script, 'utf8')
  .split('// --- main ---')[0]!
  .replace(/^import .*;\n/gm, '');
const { parseTariff, toTariff } = runInNewContext(
  `${definitions}\n({ parseTariff, toTariff })`,
  {},
) as {
  parseTariff: (s: unknown) => { label: string; price: number }[];
  toTariff: (d: unknown, at: string) => Record<string, unknown> | null;
};

// From data/raw/ispark-detail-sample.json (ParkDetay?id=3068).
const TEXT =
  '0-1 Saat : 110,00;1-2 Saat : 140,00;2-4 Saat : 170,00;4-8 Saat : 220,00;8-12 Saat : 260,00;Tam Gün : 370,00';

describe('İSPARK tariff text', () => {
  it('reads every band with its price (decimal comma, thousands dot)', () => {
    // vm objects come from another realm: compare as plain JSON.
    expect(JSON.parse(JSON.stringify(parseTariff(TEXT)))).toEqual([
      { label: '0-1 Saat', price: 110 },
      { label: '1-2 Saat', price: 140 },
      { label: '2-4 Saat', price: 170 },
      { label: '4-8 Saat', price: 220 },
      { label: '8-12 Saat', price: 260 },
      { label: 'Tam Gün', price: 370 },
    ]);
    expect(parseTariff('Tam Gün : 1.250,50')[0]?.price).toBe(1250.5);
    expect(parseTariff('bozuk;;0-1 Saat :')).toHaveLength(0);
    expect(parseTariff(null)).toHaveLength(0);
  });

  it('turns a ParkDetay record into an official tariff with the first hour, free minutes and pass', () => {
    const row = toTariff(
      { parkID: 3068, tariff: TEXT, freeTime: 15, monthlyFee: 3500 },
      '2026-10-17',
    );
    expect(row).toMatchObject({
      parkingId: 'ispark-3068',
      hourly: 110,
      freeMinutes: 15,
      monthly: 3500,
      priceKind: 'official',
      verifiedAt: '2026-10-17',
    });
    expect(toTariff({ parkID: 1, tariff: '' }, '2026-10-17')).toBeNull();
    expect(toTariff({ tariff: TEXT }, '2026-10-17')).toBeNull();
  });
});

describe('İSPARK vehicle classes', () => {
  const plain = (x: unknown) => JSON.parse(JSON.stringify(x));

  it('keeps only the car bands of a per-vehicle tariff (ispark-1189)', () => {
    const text =
      '0-3 Saat Kamyon : 120,00;0-3 Saat Minibüs-Kamyonet : 50,00;0-3 Saat Otomobil : 70,00;0-3 Saat Tır : 160,00;Tam Gün Kamyon : 450,00;Tam Gün Otomobil : 220,00';
    const row = plain(toTariff({ parkID: 1189, tariff: text, freeTime: 15 }, '2026-10-17'));
    expect(row.bands).toEqual([
      { label: '0-3 Saat Otomobil', price: 70 },
      { label: 'Tam Gün Otomobil', price: 220 },
    ]);
  });

  it('marks a bus-only park and drops a valet-only one', () => {
    const bus = plain(
      toTariff({ parkID: 1912, tariff: '1-2 Saat Otobüs : 10,00;2-3 Saat Otobüs : 20,00' }, 'x'),
    );
    expect(bus).toMatchObject({ parkingId: 'ispark-1912', bands: [], heavyVehicles: true, hourly: null });
    expect(toTariff({ parkID: 3265, tariff: 'Vale : 400,00' }, 'x')).toBeNull();
  });
});
