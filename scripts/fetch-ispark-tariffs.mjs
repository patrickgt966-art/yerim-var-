// Collects the official İSPARK tariffs (İstanbul) into data/tariffs-ispark.json. The list
// (api.ibb.gov.tr/ispark/Park) has no prices; each car park's ParkDetay carries its tariff
// ("0-1 Saat : 110,00;1-2 Saat : 140,00;...;Tam Gün : 370,00"), the free minutes and the
// monthly fee. Only car bands are kept (see carBands). A failed or thin run, or one with far
// fewer tariffs than the previous file, keeps that file, so the app never loses prices.
//
// Usage: node scripts/fetch-ispark-tariffs.mjs
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://api.ibb.gov.tr/ispark';
const UA = 'yerim-var data refresh (github.com/patrickgt966-art/yerim-var-)';
const CONCURRENCY = 4;
/** Below this share of parks with a tariff the run is treated as failed. */
const MIN_SHARE = 0.5;
/** Fewer tariffs than this share of the previous file is a partial run, not parks dropping prices. */
const MIN_KEEP_RATIO = 0.7;

/** "0-1 Saat : 110,00;Tam Gün : 370,00" -> [{ label: '0-1 Saat', price: 110 }, ...] */
function parseTariff(text) {
  if (typeof text !== 'string') return [];
  const bands = [];
  for (const part of text.split(';')) {
    const i = part.lastIndexOf(':');
    if (i < 0) continue;
    const label = part.slice(0, i).trim().replace(/\s+/g, ' ');
    const amount = part.slice(i + 1).trim();
    // An empty price is no price (Number('') would read it as free).
    const price = /\d/.test(amount) ? Number(amount.replace(/\./g, '').replace(',', '.')) : NaN;
    if (label && Number.isFinite(price) && price >= 0) bands.push({ label, price });
  }
  return bands;
}

/** The first hour's price: the band "0-1 Saat", else null. */
function firstHour(bands) {
  return bands.find((b) => /^0\s*-\s*1\s*saat/i.test(b.label))?.price ?? null;
}

// Vehicle classes, as in src/data/tariffs.ts (carBands): the app is for cars. Some parks list
// one band per class ("0-3 Saat Otomobil", "0-3 Saat Kamyon", "Tam Gün Tır"), one is for buses.
const fold = (s) => s.toLocaleLowerCase('tr');
const CAR_WORD = /(?<!\p{L})(?:otomobil|binek)(?!\p{L})/u;
const HEAVY_WORD =
  /(?<!\p{L})(?:otobüs|kamyonet|kamyon|minibüs|tır|jeep|karavan|tekne|trucks?|bus(?:es)?)(?:l[ae]r)?(?:[ıiuü])?(?!\p{L})/u;
const OTHER_CLASS_WORD = /(?<!\p{L})(?:motosiklet|vale|engelli)/u;
const isCar = (b) => CAR_WORD.test(fold(b.label));
const isOther = (b) => HEAVY_WORD.test(fold(b.label)) || OTHER_CLASS_WORD.test(fold(b.label));

/** The car bands: the car class when one is named, else every band naming no other vehicle. */
function carBands(bands) {
  return bands.some(isCar)
    ? bands.filter((b) => isCar(b) || !isOther(b))
    : bands.filter((b) => !isOther(b));
}

/** One ParkDetay record -> a tariff row, or null without a usable tariff. */
function toTariff(d, verifiedAt) {
  const all = parseTariff(d?.tariff);
  if (d?.parkID == null || all.length === 0) return null;
  const bands = carBands(all);
  // Buses or trucks only: kept without prices, so the app can leave the park out for cars.
  const heavy = bands.length === 0 && all.every((b) => HEAVY_WORD.test(fold(b.label)));
  if (bands.length === 0 && !heavy) return null;
  const free = Number(d.freeTime);
  const monthly = Number(d.monthlyFee);
  return {
    parkingId: `ispark-${d.parkID}`,
    hourly: firstHour(bands),
    currency: 'TRY',
    bands,
    ...(heavy ? { heavyVehicles: true } : {}),
    freeMinutes: Number.isFinite(free) && free > 0 ? free : 0,
    monthly: Number.isFinite(monthly) && monthly > 0 ? monthly : null,
    priceKind: 'official',
    validFrom: null,
    source: 'İBB İSPARK',
    verifiedAt,
  };
}

// --- main ---

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'data/tariffs-ispark.json');

async function get(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: controller.signal,
      });
      if (res.ok) return await res.json();
    } catch {
      // retried once below
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

const raw = await get(`${BASE}/Park`);
// An array, or (as seen elsewhere in the İBB API) an object holding one.
const list = Array.isArray(raw) ? raw : (Object.values(raw ?? {}).find(Array.isArray) ?? []);
const ids = [...new Set(list.map((r) => r?.parkID).filter((x) => x != null))];
if (ids.length === 0) {
  console.warn('İSPARK Park listesi alınamadı; eski tarifeler korunuyor.');
  process.exit(0);
}

const verifiedAt = new Date().toISOString().slice(0, 10);
const tariffs = [];
let next = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < ids.length) {
      const id = ids[next++];
      const detail = await get(`${BASE}/ParkDetay?id=${encodeURIComponent(id)}`);
      const row = toTariff(Array.isArray(detail) ? detail[0] : detail, verifiedAt);
      if (row) tariffs.push(row);
    }
  }),
);

if (tariffs.length < ids.length * MIN_SHARE) {
  console.warn(
    `İSPARK: ${ids.length} otoparktan yalnız ${tariffs.length} tarife; eski dosya korunuyor.`,
  );
  process.exit(0);
}

tariffs.sort((a, b) => a.parkingId.localeCompare(b.parkingId));
const previous = await readFile(out, 'utf8').then(JSON.parse, () => null);
// Timeouts or a short /Park list must not wipe prices the previous run had.
const before = previous?.tariffs?.length ?? 0;
if (tariffs.length < before * MIN_KEEP_RATIO) {
  console.warn(`İSPARK: ${before} → ${tariffs.length} tarife, çok düştü; eski dosya korunuyor.`);
  process.exit(0);
}
// Same prices as before: keep the file (and its dates) unchanged, so a run without news makes no commit.
const same = (xs) => JSON.stringify(xs.map(({ verifiedAt: _, ...rest }) => rest));
if (previous?.tariffs && same(previous.tariffs) === same(tariffs)) {
  console.log(`İSPARK: ${tariffs.length} tarife, değişiklik yok.`);
  process.exit(0);
}
await writeFile(
  out,
  JSON.stringify({ fetchedAt: new Date().toISOString(), parks: ids.length, tariffs }, null, 1) +
    '\n',
);
console.log(`İSPARK: ${ids.length} otopark, ${tariffs.length} tarife yazıldı.`);
