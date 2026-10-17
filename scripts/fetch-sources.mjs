// Collects static parking, place, rail and food data for İzmir, İstanbul, Ankara, Bursa and Antalya
// provinces from open sources and writes data/parkings-static[-<city>].json,
// places-/rail-/food-<city>.json plus data/sources-report.md.
//
// Runs in GitHub Actions (.github/workflows/data-refresh.yml); the app never
// calls these services itself. Sources:
// - OpenStreetMap via Overpass (ODbL): every city.
// - İzmir open data portal (CKAN, CC BY 4.0), İzmir only: every dataset matching
//   "otopark" is downloaded to data/raw/ for review; known ones are merged.
// - Bursa Büyükşehir open data portal "Açık Yeşil" (CKAN), Bursa only, optional: every resource of
//   the dataset `otopark` goes to data/raw/bursa-otopark-*; JSON / GeoJSON with points is merged
//   (capacity only) when its keys can be guessed. Any failure leaves the OSM data alone.
//
// Usage: node scripts/fetch-sources.mjs [izmir|istanbul]   (or YERIM_CITIES=istanbul)
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = (p) => path.join(root, p);
const report = [];
const log = (line) => {
  console.log(line);
  report.push(line);
};

async function fetchWithTimeout(url, init = {}, ms = 180_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// --- OpenStreetMap ---------------------------------------------------------

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

// Provinces (Overpass admin_level 4 areas); everything below runs once per city.
// YERIM_CITIES=istanbul (or `node scripts/fetch-sources.mjs istanbul`) limits the
// run to those ids; unset means all. Queries, output files and the Overpass time
// budget are per city, and one city failing never touches the other's files.
// split: İstanbul is ~5x larger, so its queries run as several smaller requests
// (one failed part fails the whole query and the old file is kept).
const CITIES = [
  {
    id: 'izmir',
    name: 'İzmir',
    budgetMin: 20,
    split: false,
    queryTimeout: 240,
    railTimeout: 120,
    httpMs: 180_000,
    railTypes: 'subway|light_rail|train|tram',
  },
  {
    id: 'istanbul',
    name: 'İstanbul',
    budgetMin: 45,
    split: true,
    // Places and food run as geographic tiles (overpassTiled) instead of `split`:
    // grid over İstanbul's bbox, minus tiles that are only sea. baseMin / placesMin /
    // foodMin are the Overpass time windows (min) of parking+rail, places and food;
    // they add up to budgetMin. timeout = per-request Overpass timeout (s).
    tiled: {
      bbox: { s: 40.8, w: 27.95, n: 41.6, e: 29.95 },
      rows: 4,
      cols: 4,
      // South-west tile (lat < 41.0, lng < 28.45) is the Marmara Sea: Silivri is at 41.07.
      skip: (t) => t.n <= 41.0 && t.e <= 28.45,
      timeout: 90,
      httpMs: 120_000,
      rounds: 2,
      pauseMs: 15_000,
      minOk: 0.9,
      // Food is supplementary (Overture already has ~13.8k restaurants): half the tiles will do.
      foodMinOk: 0.5,
      // Pause between tile requests; after HTTP 429/504 a mirror gets a longer rest (30-60 s).
      gapMs: 5_000,
      busyMinMs: 30_000,
      busyMaxMs: 60_000,
      baseMin: 20,
      placesMin: 15,
      foodMin: 10,
    },
    queryTimeout: 300,
    railTimeout: 180,
    httpMs: 330_000,
    // + funicular (Tünel, Kabataş–Taksim); Marmaray and metro are train/subway.
    railTypes: 'subway|light_rail|train|tram|funicular',
  },
  {
    id: 'ankara',
    name: 'Ankara',
    // Same tiled pattern as İstanbul, sparser data: 12 + 15 + 10 min. No live parking API.
    budgetMin: 37,
    split: true,
    tiled: {
      bbox: { s: 38.6, w: 30.8, n: 40.75, e: 34.3 },
      rows: 4,
      cols: 4,
      timeout: 90,
      httpMs: 120_000,
      rounds: 2,
      pauseMs: 15_000,
      minOk: 0.9,
      foodMinOk: 0.5,
      gapMs: 5_000,
      busyMinMs: 30_000,
      busyMaxMs: 60_000,
      baseMin: 12,
      placesMin: 15,
      foodMin: 10,
    },
    queryTimeout: 300,
    railTimeout: 180,
    httpMs: 330_000,
    // Ankaray (light_rail), Ankara metro (subway), Başkentray (train).
    railTypes: 'subway|light_rail|train|tram',
  },
  {
    id: 'bursa',
    name: 'Bursa',
    // Same tiled pattern, a smaller province: 10 + 12 + 8 min. No live parking API.
    budgetMin: 30,
    split: true,
    tiled: {
      bbox: { s: 39.55, w: 28.25, n: 40.65, e: 30.0 },
      rows: 3,
      cols: 4,
      // South-west tile (lat < 39.9167, lng < 28.6875) is Balıkesir: the province's south-west
      // edge (Büyükorhan, Orhaneli) starts east of it. The north coast stays in (İmralı is Mudanya's).
      skip: (t) => t.n <= 39.9167 && t.e <= 28.6875,
      timeout: 90,
      httpMs: 120_000,
      rounds: 2,
      pauseMs: 15_000,
      minOk: 0.9,
      foodMinOk: 0.5,
      gapMs: 5_000,
      busyMinMs: 30_000,
      busyMaxMs: 60_000,
      baseMin: 10,
      placesMin: 12,
      foodMin: 8,
    },
    queryTimeout: 300,
    railTimeout: 180,
    httpMs: 330_000,
    // Bursaray (subway / light_rail), T1 tram.
    railTypes: 'subway|light_rail|train|tram',
  },
  {
    id: 'antalya',
    name: 'Antalya',
    // Same tiled pattern, OSM only (no live parking API, no municipal parking dataset): 10 + 12 + 8 min.
    budgetMin: 30,
    split: true,
    tiled: {
      bbox: { s: 36.0, w: 29.25, n: 37.55, e: 32.65 },
      rows: 3,
      cols: 4,
      // South-middle tile (lat < 36.52, lng 30.95-31.8) is the Gulf of Antalya: the coast there
      // (Side, Alanya's Okurcalar) runs north of it. Margins keep float noise out of the edges.
      skip: (t) => t.n <= 36.53 && t.w >= 30.9 && t.e <= 31.85,
      timeout: 90,
      httpMs: 120_000,
      rounds: 2,
      pauseMs: 15_000,
      minOk: 0.9,
      foodMinOk: 0.5,
      gapMs: 5_000,
      busyMinMs: 30_000,
      busyMaxMs: 60_000,
      baseMin: 10,
      placesMin: 12,
      foodMin: 8,
    },
    queryTimeout: 300,
    railTimeout: 180,
    httpMs: 330_000,
    // Antray (tram, T1).
    railTypes: 'subway|light_rail|train|tram',
  },
];

const wantedCities = (process.env.YERIM_CITIES ?? process.argv.slice(2).join(','))
  .split(/[\s,]+/)
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const unknownCities = wantedCities.filter((id) => !CITIES.some((c) => c.id === id));
if (unknownCities.length) {
  console.error(`Bilinmeyen şehir: ${unknownCities.join(', ')} (geçerli: ${CITIES.map((c) => c.id).join(', ')})`);
  process.exit(1);
}
const cities = wantedCities.length ? CITIES.filter((c) => wantedCities.includes(c.id)) : CITIES;

const areaOf = (city) =>
  `area["boundary"="administrative"]["admin_level"="4"]["name"="${city.name}"]->.city;`;

const buildQuery = (city, statements, timeout) => `
[out:json][timeout:${timeout}];
${areaOf(city)}
(
${statements}
);
out center tags;
`;

// A query is `many` (statement groups, run one request each when the city is
// split) and `one` (all of them in a single request, the İzmir way).
const queryDef = (many, one = many.join('\n')) => ({ one, many });

const PARKING_QUERY = queryDef([
  `  nwr["amenity"="parking"](area.city);`,
  `  // Mall / hospital garages are often mapped only as an entrance or a building.
  nwr["amenity"="parking_entrance"](area.city);`,
  `  nwr["building"="parking"](area.city);`,
]);

// Named places people type into search: districts, neighbourhoods, malls,
// hospitals, universities, piers, stations, landmarks. Apple's on-device
// geocoder only knows addresses, so "İstinye" alone finds nothing.
const PLACES_QUERY = queryDef([
  `  node["place"~"^(city|town|suburb|quarter|neighbourhood|village)$"]["name"](area.city);
  nwr["shop"="mall"]["name"](area.city);
  nwr["amenity"~"^(hospital|university|college|ferry_terminal|bus_station|marketplace|theatre|townhall|courthouse)$"]["name"](area.city);`,
  `  nwr["tourism"~"^(attraction|museum|theme_park|zoo|hotel)$"]["name"](area.city);
  nwr["railway"~"^(station|halt)$"]["name"](area.city);
  nwr["leisure"~"^(stadium|park|marina|beach_resort)$"]["name"](area.city);`,
  `  nwr["historic"]["name"](area.city);`,
  `  // Office towers, business centres and iş hanları people navigate to
  // (Folkart, Megapol, Ege Perla, "Sevil 2 İş Hanı"…); apartments stay out.
  nwr["building"]["name"~"(tower|towers|kule|kuleleri|plaza|perla|megapol|iş merkezi|is merkezi|iş hanı|is hani|işhanı|ishani|business center)",i](area.city);
  nwr["office"]["name"~"(tower|towers|kule|plaza|iş merkezi|iş hanı)",i](area.city);`,
]);

// Tiled (İstanbul) form: the heavy building-name regex (last group) is its own
// tiled query and optional, so if it fails the rest of the places still ship.
PLACES_QUERY.tiled = [
  { label: 'yer adları', statements: PLACES_QUERY.many.slice(0, 3).join('\n') },
  { label: 'bina adları (ağır regex)', statements: PLACES_QUERY.many[3], optional: true },
];

// Railway stations only: a small query of its own so it still succeeds on days
// the big places query times out. Feeds the "Raylı sisteme yakın" filter.
// Ferry piers are not in here (they are kind "pier" in the places file).
const railQuery = (city) =>
  queryDef([
    `  nwr["railway"~"^(station|halt|tram_stop)$"]["name"](area.city);
  nwr["public_transport"="station"]["station"~"^(${city.railTypes})$"]["name"](area.city);`,
  ]);

// Places to eat and drink, for the "Restoran + park" idea (docs/ROADMAP.md).
const FOOD_QUERY = queryDef(
  [
    `  nwr["amenity"="restaurant"]["name"](area.city);`,
    `  nwr["amenity"~"^(cafe|fast_food)$"]["name"](area.city);`,
    `  nwr["amenity"~"^(bar|pub|ice_cream|food_court|biergarten)$"]["name"](area.city);
  nwr["shop"~"^(bakery|pastry|confectionery)$"]["name"](area.city);`,
  ],
  `  nwr["amenity"~"^(restaurant|cafe|fast_food|bar|pub|ice_cream|food_court|biergarten)$"]["name"](area.city);
  nwr["shop"~"^(bakery|pastry|confectionery)$"]["name"](area.city);`,
);

FOOD_QUERY.tiled = [
  // optional: each food group is accepted on its own; overpassTiled drops and logs a failed one.
  { label: 'restoran', statements: FOOD_QUERY.many[0], optional: true },
  { label: 'kafe, bar, pastane', statements: FOOD_QUERY.many.slice(1).join('\n'), optional: true },
];

// Each city gets its own budget for all of its Overpass queries (set in
// runCity) so a slow day cannot run past the workflow's timeout; later queries
// simply fail and keep their old file.
let overpassDeadline = 0;

// opts (tiled queries only): rounds / pauseMs = retry rounds over the mirrors and the
// backoff unit; quiet = no report line on failure (the caller summarizes);
// busyMinMs / busyMaxMs = wait after HTTP 429/504; spread = rotate the first mirror per
// request and per round so retries do not all land on the same server.
let mirrorTurn = 0;
async function overpass(query, label, httpMs = 180_000, opts = {}) {
  const rounds = opts.rounds ?? 3;
  const pauseMs = opts.pauseMs ?? 30_000;
  // Public Overpass servers are often busy (HTTP 429/5xx); retry with a pause.
  const outOfTime = () => {
    if (Date.now() <= overpassDeadline) return false;
    console.warn(`Overpass süre bütçesi doldu (${label}).`);
    return true;
  };
  const turn = opts.spread ? mirrorTurn++ : 0;
  for (let round = 0; round < rounds && !outOfTime(); round++) {
    if (round > 0) await new Promise((r) => setTimeout(r, pauseMs * round));
    for (let k = 0; k < OVERPASS.length; k++) {
      const url = OVERPASS[(turn + (opts.spread ? round : 0) + k) % OVERPASS.length];
      if (outOfTime()) break;
      try {
        const res = await fetchWithTimeout(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'yerim-var data refresh (github.com/patrickgt966-art/yerim-var-)',
          },
          body: `data=${encodeURIComponent(query)}`,
        }, httpMs);
        if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
        const body = await res.json();
        // Overpass reports timeouts/out-of-memory as HTTP 200 + a remark
        // with partial results; never ship those.
        if (body.remark) throw new Error(`kısmi sonuç: ${body.remark}`);
        return body.elements ?? [];
      } catch (e) {
        // Console only: retries vary per run and must not change the report.
        console.warn(`Overpass ${url} başarısız (tur ${round + 1}): ${e.message}`);
        if (opts.busyMinMs && (e.status === 429 || e.status === 504)) {
          // Busy mirror: rest 30-60 s (never past the budget) before the next attempt.
          const wait = Math.min(
            opts.busyMinMs + Math.random() * (opts.busyMaxMs - opts.busyMinMs),
            Math.max(0, overpassDeadline - Date.now()),
          );
          console.warn(`Sunucu meşgul; ${Math.round(wait / 1000)} sn beklenecek.`);
          await new Promise((r) => setTimeout(r, wait));
        }
      }
    }
  }
  if (opts.quiet) console.warn(`Overpass alınamadı (${label}).`);
  else log(`- Overpass alınamadı (${label}; tüm sunucular ve denemeler).`);
  return null;
}

const bboxStr = (b) => `${b.s},${b.w},${b.n},${b.e}`;
const r4 = (n) => Math.round(n * 1e4) / 1e4;

function makeTiles(cfg) {
  const { bbox, rows, cols } = cfg;
  const tiles = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      tiles.push({
        s: r4(bbox.s + ((bbox.n - bbox.s) * i) / rows),
        n: r4(bbox.s + ((bbox.n - bbox.s) * (i + 1)) / rows),
        w: r4(bbox.w + ((bbox.e - bbox.w) * j) / cols),
        e: r4(bbox.w + ((bbox.e - bbox.w) * (j + 1)) / cols),
      });
    }
  }
  return tiles.filter((t) => !cfg.skip?.(t));
}

const quarters = (b) => {
  const la = r4((b.s + b.n) / 2);
  const lo = r4((b.w + b.e) / 2);
  return [
    { s: b.s, w: b.w, n: la, e: lo },
    { s: b.s, w: lo, n: la, e: b.e },
    { s: la, w: b.w, n: b.n, e: lo },
    { s: la, w: lo, n: b.n, e: b.e },
  ];
};

// Tiled run of a query for a big city: each statement group is queried per tile
// (bbox filter on top of the area filter), results merged by OSM type/id. A failed
// tile is retried as 4 quarters. A group is accepted with >= minOk of its tiles
// fully done (minOk, default cfg.minOk). A group must also have no missing boxes,
// so a regional outage cannot delete that region's records. Returns null when
// any group is incomplete, so the old file (including optional landmarks) is kept.
async function overpassTiled(city, def, label, minOk = city.tiled.minOk) {
  const cfg = city.tiled;
  const tiles = makeTiles(cfg);
  const groups = def.tiled ?? [{ label: null, statements: def.one }];
  const merged = new Map();
  let requested = false;
  for (const g of groups) {
    const gl = g.label ? `${label} · ${g.label}` : label;
    const got = new Map();
    const missing = [];
    let okTiles = 0;
    const run = async (box, tag) => {
      // Gentle on Overpass: a pause before every request but the first.
      if (requested) await new Promise((r) => setTimeout(r, cfg.gapMs));
      requested = true;
      return overpass(
        buildQuery(city, g.statements.replaceAll('(area.city);', `(area.city)(${bboxStr(box)});`), cfg.timeout),
        `${gl} ${tag}`,
        cfg.httpMs,
        {
          rounds: cfg.rounds,
          pauseMs: cfg.pauseMs,
          quiet: true,
          busyMinMs: cfg.busyMinMs,
          busyMaxMs: cfg.busyMaxMs,
          spread: true,
        },
      );
    };
    const add = (els) => els.forEach((el) => got.set(`${el.type}/${el.id}`, el));
    for (const [i, tile] of tiles.entries()) {
      const tag = `kutu ${i + 1}/${tiles.length}`;
      const els = await run(tile, tag);
      if (els) {
        add(els);
        okTiles++;
        continue;
      }
      console.warn(`${gl} ${tag} başarısız; 4 parçaya bölünüp yeniden denenecek.`);
      const failed = [];
      for (const [j, sub] of quarters(tile).entries()) {
        const part = await run(sub, `${tag}.${j + 1}`);
        if (part) add(part);
        else failed.push(sub);
      }
      if (failed.length) missing.push(...failed);
      else okTiles++;
    }
    const ok = okTiles / tiles.length >= minOk && missing.length === 0;
    log(
      `- ${gl}: ${tiles.length} kutu, ${okTiles} tam başarılı` +
        (ok ? '' : ` (eşik %${minOk * 100}; sonuç kullanılmadı)`) +
        (missing.length ? `; eksik bölgeler (güney,batı,kuzey,doğu): ${missing.map(bboxStr).join(' | ')}` : '') +
        '.',
    );
    if (!ok) {
      return null;
    }
    for (const [k, el] of got) merged.set(k, el);
  }
  return [...merged.values()];
}

// Runs a query definition: one request, or one per group for a split city
// (null if any part failed: a partial list must not replace the old file).
async function overpassParts(city, def, label, timeout) {
  const groups = city.split ? def.many : [def.one];
  const merged = new Map();
  for (const [i, statements] of groups.entries()) {
    const part = groups.length > 1 ? `${label} ${i + 1}/${groups.length}` : label;
    const els = await overpass(buildQuery(city, statements, timeout), part, city.httpMs);
    if (!els) return null;
    if (groups.length === 1) return els;
    for (const el of els) merged.set(`${el.type}/${el.id}`, el);
  }
  return [...merged.values()];
}

const int = (v) => {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const round = (n) => Math.round(n * 1e6) / 1e6;

// Where an OSM car park record came from (entrances are merged per garage).
const osmOrigin = (t) =>
  t.amenity === 'parking' ? 'parking' : t.amenity === 'parking_entrance' ? 'entrance' : 'building';

function fromOsm(el) {
  const t = el.tags ?? {};
  if (t.amenity !== 'parking' && t.amenity !== 'parking_entrance' && t.building !== 'parking')
    return null;
  // Only car parks the public can use (no permit/residents/employees/...).
  if (t.access && !['yes', 'permissive', 'customers', 'public', 'destination'].includes(t.access))
    return null;
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  const kind = t.parking ?? null;
  const street = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ');
  return {
    id: `osm-${el.type}-${el.id}`,
    // A bare "Otopark" is a description, not a name.
    name:
      [t.name, t['name:tr']].find((n) => n && n.trim().toLocaleLowerCase('tr') !== 'otopark') ??
      null,
    lat: round(lat),
    lng: round(lng),
    capacity: int(t.capacity),
    isPaid: t.fee === 'yes' ? true : t.fee === 'no' ? false : null,
    // OSM tags the structure itself, so both values are meaningful here.
    isIndoor:
      t.building === 'parking' || ['multi-storey', 'underground'].includes(kind)
      ? true
      : kind === 'surface'
        ? false
        : null,
    nonstop: t.opening_hours === '24/7' ? true : null,
    openingHoursText: t.opening_hours && t.opening_hours !== '24/7' ? t.opening_hours : null,
    operator: t.operator ?? null,
    address: street || t['addr:full'] || null,
    access: t.access === 'customers' ? 'customers' : null,
    // Only emitted when tagged, so untagged records stay as small as before.
    ...(int(t['capacity:disabled']) ? { disabledCapacity: int(t['capacity:disabled']) } : {}),
    ...(['yes', 'limited', 'no'].includes(t.wheelchair) ? { wheelchair: t.wheelchair } : {}),
    source: 'osm',
  };
}

// --- İzmir open data portal (CKAN) -----------------------------------------

const CKAN = 'https://acikveri.bizizmir.com/api/3/action';

async function ckan(action, params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetchWithTimeout(`${CKAN}/${action}?${qs}`, {}, 60_000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (!body.success) throw new Error(JSON.stringify(body.error));
  return body.result;
}

async function portal() {
  const found = [];
  try {
    const search = await ckan('package_search', { q: 'otopark', rows: '50' });
    for (const pkg of search.results ?? []) {
      for (const r of pkg.resources ?? []) {
        const entry = {
          dataset: pkg.name,
          title: pkg.title,
          license: pkg.license_title ?? pkg.license_id ?? null,
          resource: r.id,
          resourceName: r.name,
          format: r.format,
          url: r.url,
          lastModified: r.last_modified ?? r.metadata_modified ?? null,
          datastore: !!r.datastore_active,
          records: null,
          fields: null,
        };
        if (r.datastore_active) {
          try {
            const ds = await ckan('datastore_search', { resource_id: r.id, limit: '5000' });
            entry.records = ds.records?.length ?? 0;
            entry.fields = (ds.fields ?? []).map((f) => `${f.id}:${f.type}`);
            Object.defineProperty(entry, 'rows', { value: ds.records, enumerable: false });
            await writeFile(
              out(`data/raw/ckan-${r.id}.json`),
              JSON.stringify({ ...entry, rows: ds.records }, null, 1) + '\n',
            );
          } catch (e) {
            entry.error = e.message;
          }
        }
        found.push(entry);
      }
    }
  } catch (e) {
    log(`- Açık veri portalı başarısız: ${e.message}`);
    return null;
  }
  return found;
}

// İzelman inventory (2022): official locations, capacity and hours.
// Resource id -> kind. The subscriber-only blocks on Mustafa Kemal Sahil
// Bulvarı (22cf1829-…) are left out: they are not open to visitors.
const IZELMAN = {
  'a982c5d9-931d-4a75-a61d-23127d8ddad2': 'street',
  '6ad4ad67-5923-49ec-8725-3f44f6f72aec': 'indoor',
  '959c08c4-3e62-4e20-9e45-c334b0df31b1': 'open',
};

const titleTr = (s) =>
  s
    .toLocaleLowerCase('tr')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^|[\s(-])(\p{L})/gu, (_, pre, ch) => pre + ch.toLocaleUpperCase('tr'));

// Stable across republished CKAN datasets: derived from the final name and rounded position,
// not from the row order, so saved favorites keep pointing at the same car park.
function stableIzelmanId(p) {
  const key = `${p.name.toLocaleLowerCase('tr')}|${p.lat.toFixed(4)}|${p.lng.toFixed(4)}`;
  return 'izelman-' + createHash('sha1').update(key).digest('hex').slice(0, 10);
}

function fromIzelman(row, kind, resourceId) {
  const lat = Number(row.ENLEM);
  const lng = Number(row.BOYLAM);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  let name = titleTr(String(row.OTOPARK_ADI ?? ''));
  if (!name) return null;
  if (!/otopark/i.test(name)) name += kind === 'street' ? ' Yol Kenarı Otoparkı' : ' Otoparkı';
  const open = String(row.ACILIS_SAATI ?? '');
  const close = String(row.KAPANIS_SAATI ?? '');
  const nonstop = open === '00:00' && close === '24:00';
  const extra = String(row.EK_BILGI ?? '').trim();
  const hours = [
    open && close && !nonstop ? `${open}–${close}` : null,
    extra ? titleTr(extra) : null,
  ]
    .filter(Boolean)
    .join(', ');
  const street = String(row.ADRES ?? row.ADRES_VEYA_TARIF ?? '').trim();
  const rec = {
    id: '',
    name,
    lat: round(lat),
    lng: round(lng),
    capacity: int(row.KAPASITE),
    isPaid: null,
    isIndoor: kind === 'indoor',
    nonstop: nonstop ? true : null,
    openingHoursText: hours || null,
    operator: 'İZELMAN A.Ş',
    address:
      [street && titleTr(street), row.ILCE && titleTr(String(row.ILCE))]
        .filter(Boolean)
        .join(', ') || null,
    access: /abone/i.test(extra) ? 'subscribers' : null,
    source: 'izelman',
  };
  rec.id = stableIzelmanId(rec);
  return rec;
}

// --- Bursa open data portal "Açık Yeşil" (CKAN), optional ---------------------

const BURSA_CKAN = 'https://acikyesil.bursa.bel.tr/api/3/action';
// A little wider than the province: a point outside is a wrong column, not a Bursa car park.
const BURSA_BOX = { s: 39.4, n: 40.8, w: 28.1, e: 30.2 };
const MAX_RAW_BYTES = 25 * 1024 * 1024;

// Column name -> comparable key: "OTOPARK_ADI" and "Otopark Adı" both become "otoparkadi".
const nk = (k) => foldTr(String(k)).replace(/ /g, '');
const toNum = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string' || !v.trim()) return null;
  const n = Number(v.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const inBursa = (lat, lng) =>
  lat >= BURSA_BOX.s && lat <= BURSA_BOX.n && lng >= BURSA_BOX.w && lng <= BURSA_BOX.e;
/** [lat, lng] if the pair lies in Bursa, also when the two columns were swapped; else null. */
const bursaPoint = (a, b) =>
  a == null || b == null ? null : inBursa(a, b) ? [a, b] : inBursa(b, a) ? [b, a] : null;

const LAT_KEYS = /^(lat|latitude|latitud|enlem|y|ycoord|ycoordinate|koordinaty|coordy|konumy)$/;
const LNG_KEYS = /^(lng|lon|long|longitude|longitud|boylam|x|xcoord|xcoordinate|koordinatx|coordx|konumx)$/;
const POINT_KEYS = /^(konum|koordinat|koordinatlar|coordinates|coordinate|location|latlng|latlon|geom|geometry|wkt|the_geom|thegeom)$/;
const NAME_KEYS = ['otoparkadi', 'otoparkismi', 'adi', 'ad', 'isim', 'name', 'baslik', 'title', 'tanim', 'yeradi', 'lokasyonadi', 'lokasyon'];
const NAME_NOT = /(ilce|mahalle|yol|sokak|cadde|kurum|isletme|firma|sahip|durum|tip|tur|adres|kod|sayi|id$|no$)/;
const CAP_NOT = /(engelli|bos|dolu|motor|bisiklet|sarj|elektrik)/;

/** Which columns hold the point, name and capacity; guessed from the column names. */
function detectKeys(rows) {
  const keys = new Map(); // normalized -> original
  for (const row of rows.slice(0, 200)) {
    for (const k of Object.keys(row)) if (!keys.has(nk(k))) keys.set(nk(k), k);
  }
  const all = [...keys.keys()];
  const orig = (n) => (n == null ? null : keys.get(n));
  const lat = all.find((n) => LAT_KEYS.test(n) || n.includes('enlem') || n.includes('latitude'));
  const lng = all.find((n) => LNG_KEYS.test(n) || n.includes('boylam') || n.includes('longitude'));
  const point = all.find((n) => POINT_KEYS.test(n));
  const name =
    NAME_KEYS.find((n) => keys.has(n)) ??
    all.find((n) => (n.includes('otopark') || n.includes('adi')) && !NAME_NOT.test(n) && !n.includes('kapasite'));
  const cap =
    all.find((n) => /^(kapasite|capacity|kapasitesi)$/.test(n)) ??
    all.find((n) => n.includes('kapasite') && !CAP_NOT.test(n)) ??
    all.find((n) => n.includes('capacity') && !CAP_NOT.test(n)) ??
    all.find((n) => /(aracsayisi|parkyerisayisi|parksayisi|aracadedi|kontenjan)/.test(n));
  return { lat: orig(lat), lng: orig(lng), point: orig(point), name: orig(name), cap: orig(cap) };
}

/** [lat, lng] from a combined value: "40.19,29.06", [lng, lat], {lat, lng} or WKT POINT(lng lat). */
function pointFromValue(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return v.length >= 2 ? bursaPoint(toNum(v[0]), toNum(v[1])) : null;
  if (typeof v === 'object') {
    const k = Object.keys(v);
    const la = k.find((x) => LAT_KEYS.test(nk(x)));
    const lo = k.find((x) => LNG_KEYS.test(nk(x)));
    if (la && lo) return bursaPoint(toNum(v[la]), toNum(v[lo]));
    return v.coordinates ? pointFromValue(v.coordinates) : null;
  }
  const m = String(v).match(/(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)/);
  return m ? bursaPoint(Number(m[1]), Number(m[2])) : null;
}

/** Rows of a JSON / GeoJSON body: features (properties + point) or the biggest array of objects. */
function rowsOf(body) {
  if (body && body.type === 'FeatureCollection' && Array.isArray(body.features)) {
    return body.features
      .filter((f) => f && typeof f === 'object')
      .map((f) => ({ ...(f.properties ?? {}), __point: f.geometry?.type === 'Point' ? f.geometry.coordinates : null }));
  }
  let best = [];
  const walk = (node, depth) => {
    if (Array.isArray(node)) {
      const objs = node.filter((x) => x && typeof x === 'object' && !Array.isArray(x));
      if (objs.length > best.length) best = objs;
      if (depth < 3) for (const x of node.slice(0, 3)) walk(x, depth + 1);
    } else if (node && typeof node === 'object' && depth < 3) {
      for (const x of Object.values(node)) walk(x, depth + 1);
    }
  };
  walk(body, 0);
  return best;
}

function fromBursaRow(row, keys) {
  let pt = null;
  if (row.__point) pt = bursaPoint(toNum(row.__point[1]), toNum(row.__point[0])); // GeoJSON is [lng, lat]
  if (!pt && keys.lat && keys.lng) pt = bursaPoint(toNum(row[keys.lat]), toNum(row[keys.lng]));
  if (!pt && keys.point) pt = pointFromValue(row[keys.point]);
  if (!pt) return null;
  const rawName = keys.name ? String(row[keys.name] ?? '').trim() : '';
  const cap = keys.cap ? int(Math.round(toNum(row[keys.cap]) ?? 0)) : null;
  const capacity = cap && cap <= 20000 ? cap : null; // larger is a wrong column
  // A point with neither a name nor a capacity adds nothing over OSM.
  if (!rawName && !capacity) return null;
  let name = rawName ? titleTr(rawName) : null;
  if (name && !/otopark/i.test(name)) name += ' Otoparkı';
  const rec = {
    id: '',
    name,
    lat: round(pt[0]),
    lng: round(pt[1]),
    capacity,
    isPaid: null,
    isIndoor: null,
    nonstop: null,
    openingHoursText: null,
    operator: 'Bursa Büyükşehir Belediyesi',
    address: null,
    access: null,
    // Same kind as the İzelman inventory: municipal, capacity only, never a free count.
    source: 'izelman',
  };
  const key = `${(name ?? '').toLocaleLowerCase('tr')}|${rec.lat.toFixed(4)}|${rec.lng.toFixed(4)}`;
  rec.id = 'bursa-bb-' + createHash('sha1').update(key).digest('hex').slice(0, 10);
  return rec;
}

/**
 * Downloads every resource of the Açık Yeşil dataset `otopark` to data/raw/bursa-otopark-* and
 * returns the car parks found in the JSON / GeoJSON ones. Never throws: each step has its own
 * try/catch and logs what it found, so a changed portal only shortens the report.
 */
async function bursaPortal() {
  const records = [];
  log('## Bursa açık veri portalı (Açık Yeşil, "otopark" veri seti)');
  log('');
  let pkg;
  try {
    const res = await fetchWithTimeout(`${BURSA_CKAN}/package_show?id=otopark`, {}, 60_000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    if (!body.success) throw new Error('success=false');
    pkg = body.result;
  } catch (e) {
    console.warn(`Açık Yeşil: ${e.message}`);
    log('- Veri seti alınamadı (isteğe bağlı kaynak; yalnızca OSM kullanıldı).');
    log('');
    return records;
  }
  const resources = Array.isArray(pkg?.resources) ? pkg.resources : [];
  log(`- Veri seti: ${pkg?.title ?? 'otopark'} (${pkg?.license_title ?? pkg?.license_id ?? 'lisans?'}), ${resources.length} kaynak.`);
  const used = new Set();
  for (const [i, r] of resources.entries()) {
    const label = `${r?.name ?? r?.id ?? `kaynak ${i + 1}`} (${r?.format ?? '?'})`;
    try {
      const url = String(r?.url ?? '');
      if (!/^https?:\/\//i.test(url)) {
        log(`- ${label}: adres yok, atlandı.`);
        continue;
      }
      const res = await fetchWithTimeout(url, {}, 120_000);
      if (!res.ok) {
        log(`- ${label}: indirilemedi (HTTP ${res.status}).`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const ext = String(r?.format ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin';
      let base = `bursa-otopark-${String(r?.id ?? `r${i + 1}`).replace(/[^A-Za-z0-9-]/g, '').slice(0, 40) || `r${i + 1}`}`;
      if (used.has(base)) base += `-${i + 1}`;
      used.add(base);
      if (buf.length > MAX_RAW_BYTES) {
        log(`- ${label}: ${buf.length} bayt, çok büyük; kaydedilmedi.`);
        continue;
      }
      await writeFile(out(`data/raw/${base}.${ext}`), buf);
      let rows = null;
      try {
        rows = rowsOf(JSON.parse(buf.toString('utf8').replace(/^﻿/, '')));
      } catch {
        log(`- ${label}: data/raw/${base}.${ext} (${buf.length} bayt), JSON değil; birleştirilmedi.`);
        continue;
      }
      if (rows.length === 0) {
        log(`- ${label}: data/raw/${base}.${ext} (${buf.length} bayt), kayıt dizisi bulunamadı.`);
        continue;
      }
      const keys = detectKeys(rows);
      const found = rows.map((row) => fromBursaRow(row, keys)).filter(Boolean);
      log(
        `- ${label}: data/raw/${base}.${ext} (${buf.length} bayt), ${rows.length} satır; bulunan alanlar: ` +
          `enlem=${keys.lat ?? '—'}, boylam=${keys.lng ?? '—'}, konum=${keys.point ?? '—'}, ad=${keys.name ?? '—'}, kapasite=${keys.cap ?? '—'}; ` +
          `kullanılabilir: ${found.length}.`,
      );
      records.push(...found);
    } catch (e) {
      console.warn(`Açık Yeşil ${label}: ${e.message}`);
      log(`- ${label}: işlenemedi (${e.name === 'AbortError' ? 'zaman aşımı' : e.message}).`);
    }
  }
  // Same name at the same rounded spot hashes alike: suffix repeats with -2, -3… in list order.
  const seen = new Map();
  for (const z of records) {
    const n = (seen.get(z.id) ?? 0) + 1;
    seen.set(z.id, n);
    if (n > 1) z.id = `${z.id}-${n}`;
  }
  log(`- Birleştirilecek belediye otoparkı: ${records.length}.`);
  log('');
  return records;
}

// --- Places for search --------------------------------------------------

function placeKind(t) {
  if (t.place) return ['city', 'town', 'village'].includes(t.place) ? 'town' : 'area';
  if (t.shop === 'mall') return 'mall';
  if (t.amenity === 'hospital') return 'hospital';
  if (['university', 'college'].includes(t.amenity)) return 'university';
  if (t.amenity === 'ferry_terminal') return 'pier';
  if (t.railway) return 'rail';
  if (t.amenity === 'bus_station') return 'station';
  if (t.tourism === 'hotel') return 'hotel';
  return 'landmark';
}

function fromPlace(el) {
  const t = el.tags ?? {};
  const name = t['name:tr'] ?? t.name;
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (!name || typeof lat !== 'number' || typeof lng !== 'number') return null;
  // Compact keys: this file ships inside the app.
  return {
    n: name,
    a: Math.round(lat * 1e5) / 1e5,
    o: Math.round(lng * 1e5) / 1e5,
    k: placeKind(t),
  };
}

// --- Food places (review data) -------------------------------------------

const yes = (v) => (v === 'yes' ? true : v === 'no' ? false : null);

const DIETS = ['vegetarian', 'vegan', 'pescetarian', 'halal', 'gluten_free'];

/**
 * Diet tags as codes: "vegan" when the place serves only that (diet:vegan=only, or cuisine=vegan),
 * "vegan_options" when it offers it (diet:vegan=yes). Null when none is tagged.
 */
function dietsOf(t, cuisine) {
  const out = [];
  for (const d of DIETS) {
    const v = t[`diet:${d}`];
    if (v === 'only' || cuisine.includes(d)) out.push(d);
    else if (v === 'yes' || v === 'limited') out.push(`${d}_options`);
  }
  return out.length ? out : null;
}

function fromFood(el) {
  const t = el.tags ?? {};
  const name = t.name ?? t['name:tr'];
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (!name || typeof lat !== 'number' || typeof lng !== 'number') return null;
  const cuisine = (t.cuisine ?? '')
    .split(/[;,]/)
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  const street = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ');
  // Compact keys; null/empty fields are dropped below to keep the file small.
  const rec = {
    id: `osm-${el.type[0]}${el.id}`,
    n: name.trim(),
    a: Math.round(lat * 1e5) / 1e5,
    o: Math.round(lng * 1e5) / 1e5,
    k: t.amenity ?? t.shop,
    c: cuisine.length ? cuisine : null,
    dt: dietsOf(t, cuisine),
    h: t.opening_hours ?? null,
    p: t.phone ?? t['contact:phone'] ?? null,
    w: t.website ?? t['contact:website'] ?? null,
    ig: t['contact:instagram'] ?? null,
    ad: street || null,
    out: yes(t.outdoor_seating),
    wc: t.wheelchair === 'yes' ? true : t.wheelchair === 'no' ? false : null,
    res: t.reservation ?? null,
  };
  return Object.fromEntries(Object.entries(rec).filter(([, v]) => v != null));
}

/** Lower-case, Turkish letters folded to ASCII, punctuation dropped. */
const foldTr = (s) =>
  s
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Mis-tagged places that are not somewhere to eat out (pharmacies, school
// canteens) and names without at least two Latin letters ("." / "404").
const NOT_FOOD = /(eczane|anaokulu|ilkokulu|ortaokulu|lisesi)/i;
const usableFoodName = (n) => (foldTr(n).match(/[a-z]/g) ?? []).length >= 2 && !NOT_FOOD.test(n);

const pct = (n, total) => (total ? `${Math.round((n / total) * 100)}%` : '0%');

// --- Live API reachability (for the report only) ---------------------------

async function liveApi() {
  try {
    const res = await fetchWithTimeout(
      'https://openapi.izmir.bel.tr/api/ibb/izum/otoparklar',
      {},
      60_000,
    );
    const body = await res.json();
    // No timings here: the report must only change when the data does.
    return `HTTP ${res.status}, ${Array.isArray(body) ? body.length : '?'} kayıt`;
  } catch (e) {
    return `başarısız (${e.message})`;
  }
}

// --- helpers ---------------------------------------------------------------

const meters = (a, b) => {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = dLat ** 2 + Math.cos((a.lat * Math.PI) / 180) ** 2 * dLng ** 2;
  return 6371000 * Math.sqrt(x);
};

/** Keeps the most informative record of each cluster closer than `m` metres. */
function dedupe(list, m, score) {
  const kept = [];
  for (const p of [...list].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))) {
    if (!kept.some((k) => meters(k, p) <= m)) kept.push(p);
  }
  return kept;
}

/**
 * Writes JSON, keeping the old generatedAt when the payload is unchanged.
 * Refuses a list that shrank below 70 % of the previous one: that is far
 * more likely a source hiccup than real car parks disappearing.
 */
async function writeData(file, payload) {
  const list = payload.items ?? payload.parkings;
  let generatedAt = new Date().toISOString();
  try {
    const old = JSON.parse(await readFile(out(file), 'utf8'));
    const oldList = old.items ?? old.parkings ?? [];
    if (oldList.length > 0 && list.length < oldList.length * 0.7) {
      log(`- ${file}: ${oldList.length} → ${list.length} kayıt, çok düştü; yazılmadı.`);
      return false;
    }
    if (JSON.stringify(oldList) === JSON.stringify(list)) generatedAt = old.generatedAt;
  } catch {
    // first run
  }
  await writeFile(out(file), JSON.stringify({ ...payload, generatedAt }) + '\n');
  return true;
}

// --- main ------------------------------------------------------------------

await mkdir(out('data/raw'), { recursive: true });
log(`# Veri kaynakları raporu`);
log('');

// Only public reference points. Hospitals, campuses, malls and hotels are
// left out: "Otopark · X yakını" next to them reads as if the car park
// belonged to them (and might be for their visitors only).
const LANDMARK_KINDS = new Set(['area', 'station', 'rail', 'pier', 'landmark']);
// Names too common to point anywhere ("Çocuk Parkı yakını" could be any of
// hundreds) and residential buildings, which read as private property.
const GENERIC_LANDMARK =
  /^(?:(?:çocuk |halk )?park[ıi]?|dinlenme ve çocuk parkı|yeşil alan|merkez|pazar ?yeri|türbe|cami|(?:mustafa kemal )?atatürk (?:büstü|heykeli|anıtı)|şehitler anıtı)$|apartman[ıi]?$|\bapt\.?$|(?:^|\s)sitesi$/;
const usableLandmark = (n) =>
  n.length <= 28 && !/[()]/.test(n) && !GENERIC_LANDMARK.test(n.toLocaleLowerCase('tr').trim());

async function runCity(city) {
  const izmir = city.id === 'izmir';
  // İzmir keeps its original labels and file names; other cities get a prefix / suffix.
  const H = (s) => (izmir ? `## ${s}` : `## ${city.name} · ${s}`);
  const L = (s) => (izmir ? s : `${city.name}: ${s}`);
  const files = {
    parkings: izmir ? 'data/parkings-static.json' : `data/parkings-static-${city.id}.json`,
    places: `data/places-${city.id}.json`,
    rail: `data/rail-${city.id}.json`,
    food: `data/food-${city.id}.json`,
  };
  const totalDeadline = Date.now() + city.budgetMin * 60_000;
  // A tiled city gives each phase its own window (never past the total budget).
  const setBudget = (min) => {
    overpassDeadline = min ? Math.min(totalDeadline, Date.now() + min * 60_000) : totalDeadline;
  };
  setBudget(city.tiled?.baseMin);
  const query = (def, label, timeout = city.queryTimeout) => overpassParts(city, def, label, timeout);
  const queryBig = (def, label, min, minOk) => {
    if (!city.tiled) return query(def, label);
    setBudget(min);
    return overpassTiled(city, def, label, minOk);
  };

  const elements = await query(PARKING_QUERY, L('otoparklar'));
  const originOf = new Map();
  const osmAll = [];
  for (const el of elements ?? []) {
    const rec = fromOsm(el);
    if (!rec) continue;
    osmAll.push(rec);
    originOf.set(rec.id, osmOrigin(el.tags ?? {}));
  }
  // The same car park is often mapped twice (a node and an area).
  // An entrance never wins over a car park or garage building here.
  const isEntrance = (p) => originOf.get(p.id) === 'entrance';
  const osmDeduped = dedupe(
    osmAll,
    30,
    (p) => (isEntrance(p) ? -10 : 0) + (p.name ? 2 : 0) + (p.capacity ? 1 : 0),
  );
  // Entrance nodes: skip those next to a mapped car park, one per garage otherwise.
  const osmSolid = osmDeduped.filter((p) => !isEntrance(p));
  // A parking area duplicating a garage building: drop it if either is unnamed or the names match.
  const osmBuildings = osmSolid.filter((p) => originOf.get(p.id) === 'building');
  const buildingGain = new Map();
  const osmAreas = osmSolid.filter((p) => {
    if (originOf.get(p.id) !== 'parking') return true;
    const b = osmBuildings.find(
      (q) => meters(p, q) <= 80 && (!p.name || !q.name || foldTr(p.name) === foldTr(q.name)),
    );
    if (!b) return true;
    // An unnamed building takes the dropped area's name (and capacity if it has none).
    if (!b.name && p.name && !buildingGain.has(b.id)) {
      buildingGain.set(b.id, { name: p.name, ...(b.capacity || !p.capacity ? {} : { capacity: p.capacity }) });
    }
    return false;
  });
  const osmEntrances = dedupe(
    osmDeduped.filter((p) => isEntrance(p) && !osmSolid.some((s) => meters(p, s) <= 80)),
    80,
    (p) => (p.name ? 100 : 0) + Object.values(p).filter((v) => v != null).length,
  );
  const osm = [...osmAreas.map((p) => ({ ...p, ...buildingGain.get(p.id) })), ...osmEntrances];
  log(H('OpenStreetMap (ODbL)'));
  log('');
  if (elements) {
    log(
      `- Ham öğe: ${elements.length}, herkese açık: ${osmAll.length}, çiftler ayıklanınca: ${osm.length}`,
    );
    log(
      `- Adı olan: ${osm.filter((p) => p.name).length}, kapasitesi olan: ${osm.filter((p) => p.capacity).length}, ücretli işaretli: ${osm.filter((p) => p.isPaid === true).length}`,
    );
    log(
      `- Giriş noktasından türeyen: ${osm.filter(isEntrance).length}, bina olarak işaretli: ${osm.filter((p) => originOf.get(p.id) === 'building').length}`,
    );
  }
  log('');

  // Bursa's municipal inventory is optional: bursaPortal never throws and may return nothing.
  const bursaMuni = city.id === 'bursa' ? await bursaPortal() : [];

  // The İzmir municipal portal and live API are İzmir-only.
  let ckanFound = null;
  if (izmir) {
    ckanFound = await portal();
    log('## İzmir açık veri portalı ("otopark" araması)');
    log('');
    // Sorted so the report does not change with the portal's result order.
    for (const r of [...(ckanFound ?? [])].sort((a, b) => a.resource.localeCompare(b.resource))) {
      log(
        `- **${r.title}** / ${r.resourceName} (${r.format}, ${r.license ?? 'lisans?'}, güncelleme: ${r.lastModified ?? '?'})` +
          (r.records != null ? ` — ${r.records} kayıt; alanlar: ${r.fields.join(', ')}` : '') +
          (r.error ? ` — hata: ${r.error}` : ''),
      );
    }
    log('');

    log('## Canlı doluluk API erişimi (GitHub sunucusundan)');
    log('');
    log(`- ${await liveApi()}`);
    log('');
  }

  // Rail stations first: the query is small, so run it while the Overpass budget is fresh.
  const railEls = await query(railQuery(city), L('raylı sistem istasyonları'), city.railTimeout);
  let railItems = [];
  if (railEls && railEls.length > 0) {
    const all = railEls
      .map((el) => {
        const t = el.tags ?? {};
        const name = t['name:tr'] ?? t.name;
        const lat = el.lat ?? el.center?.lat;
        const lng = el.lon ?? el.center?.lon;
        if (!name || typeof lat !== 'number' || typeof lng !== 'number') return null;
        return { n: name, a: Math.round(lat * 1e5) / 1e5, o: Math.round(lng * 1e5) / 1e5 };
      })
      .filter(Boolean);
    // One entry per name within 300 m (platform nodes, station building, stop position).
    const seen = new Map();
    for (const p of all.sort((x, y) => x.n.localeCompare(y.n, 'tr') || x.a - y.a || x.o - y.o)) {
      const prev = seen.get(p.n) ?? [];
      if (prev.some((q) => meters({ lat: q.a, lng: q.o }, { lat: p.a, lng: p.o }) <= 300)) continue;
      seen.set(p.n, [...prev, p]);
      railItems.push(p);
    }
  }

  // Places first: they also name unnamed car parks ("Otopark · Bostanlı yakını").
  const placeEls = await queryBig(PLACES_QUERY, L('yer adları'), city.tiled?.placesMin);
  let places = null;
  if (placeEls && placeEls.length > 0) {
    const all = placeEls.map(fromPlace).filter(Boolean);
    // One entry per name within 300 m (e.g. a mall's node and building).
    const seen = new Map();
    places = [];
    for (const p of all.sort((a, b) => a.n.localeCompare(b.n, 'tr') || a.a - b.a || a.o - b.o)) {
      const prev = seen.get(p.n) ?? [];
      if (prev.some((q) => meters({ lat: q.a, lng: q.o }, { lat: p.a, lng: p.o }) <= 300)) continue;
      seen.set(p.n, [...prev, p]);
      places.push(p);
    }
  }
  // Fall back to the last good list so naming does not flip on a bad run.
  const namingPlaces =
    places ??
    (await readFile(out(files.places), 'utf8')
      .then((txt) => JSON.parse(txt).items ?? [])
      .catch((e) => {
        log(`- Uyarı: yedek yer listesi okunamadı (${e.message}); adsız otoparklar adlandırılmadı.`);
        return [];
      }));
  // Filtered once (same order, same result) instead of per car park: İstanbul has ~5x more of both.
  const landmarks = namingPlaces.filter((q) => LANDMARK_KINDS.has(q.k) && usableLandmark(q.n));
  function nearestPlace(p, maxM = 250) {
    // Car parks restricted to customers/subscribers keep the plain name.
    if (p.access) return null;
    let best = null;
    let bestM = maxM;
    for (const q of landmarks) {
      const m = meters(p, { lat: q.a, lng: q.o });
      if (m < bestM) {
        best = q.n;
        bestM = m;
      }
    }
    return best;
  }

  const izelman = (ckanFound ?? []).flatMap((r) =>
    IZELMAN[r.resource] && r.rows
      ? r.rows.map((row) => fromIzelman(row, IZELMAN[r.resource], r.resource)).filter(Boolean)
      : [],
  );
  // Same name at the same rounded spot hashes alike: suffix repeats with -2, -3… in list order.
  {
    const seen = new Map();
    for (const z of izelman) {
      const n = (seen.get(z.id) ?? 0) + 1;
      seen.set(z.id, n);
      if (n > 1) z.id = `${z.id}-${n}`;
    }
  }
  log(H('Sonuç'));
  log('');
  if (izmir) log(`- İzelman envanteri: ${izelman.length} otopark.`);

  // Official records win over OSM points of the same car park.
  const official = [...izelman, ...bursaMuni];
  const osmKept = osm
    .filter((o) => !official.some((z) => meters(o, z) <= 80))
    .map((o) => (o.name ? o : { ...o, near: nearestPlace(o) }));
  if (izmir) log(`- OSM'den İzelman ile çakışan ${osm.length - osmKept.length} kayıt çıkarıldı.`);
  if (bursaMuni.length) log(`- OSM'den Açık Yeşil ile çakışan ${osm.length - osmKept.length} kayıt çıkarıldı.`);
  log(`- Adsız otoparklardan yakın yer adı bulunan: ${osmKept.filter((o) => o.near).length}.`);

  // İzmir needs both sources; other cities only have OSM (and an empty answer is not a result).
  if (elements && (izmir ? izelman.length > 0 : elements.length > 0)) {
    const parkings = [...official, ...osmKept].sort((a, b) => a.id.localeCompare(b.id));
    const wrote = await writeData(files.parkings, {
      $comment: izmir
        ? 'Generated by scripts/fetch-sources.mjs. izelman-*: İzmir Büyükşehir Belediyesi Açık Veri (İzelman otopark envanteri); id = izelman-<first 10 hex of sha1(lowercase tr name|lat 4 dp|lng 4 dp)>, repeats get -2, -3 in list order. osm-*: © OpenStreetMap contributors, ODbL 1.0. near: nearest OSM place name within 250 m, for unnamed car parks.'
        : `Generated by scripts/fetch-sources.mjs. ${bursaMuni.length ? 'bursa-bb-*: Bursa Büyükşehir Belediyesi Açık Yeşil (otopark veri seti, yalnızca kapasite). ' : ''}osm-*: © OpenStreetMap contributors, ODbL 1.0 (${city.name}). near: nearest OSM place name within 250 m, for unnamed car parks.`,
      licenses: izmir
        ? { izelman: 'İzmir BB Açık Veri Lisansı', osm: 'ODbL-1.0' }
        : bursaMuni.length
          ? { 'bursa-bb': 'Bursa Büyükşehir Belediyesi Açık Yeşil', osm: 'ODbL-1.0' }
          : { osm: 'ODbL-1.0' },
      parkings,
    });
    if (wrote) log(`- ${files.parkings}: ${parkings.length} otopark.`);
  } else {
    // Keep the previous file rather than ship a partial one.
    log(`- Bir kaynak alınamadı; ${files.parkings} değiştirilmedi.`);
  }

  if (places) {
    const wrote = await writeData(files.places, {
      $comment:
        'Generated by scripts/fetch-sources.mjs for search. n=name, a=lat, o=lng, k=kind. © OpenStreetMap contributors, ODbL 1.0.',
      items: places,
    });
    if (wrote) log(`- ${files.places}: ${places.length} yer (arama için).`);
  } else {
    log(`- Yer listesi alınamadı; ${files.places} değiştirilmedi.`);
  }

  if (railItems.length > 0) {
    const wrote = await writeData(files.rail, {
      $comment: izmir
        ? 'Generated by scripts/fetch-sources.mjs from OpenStreetMap (© OpenStreetMap contributors, ODbL 1.0): İZBAN, metro, tram and train stations in İzmir, for the "Raylı sisteme yakın" filter.'
        : `Generated by scripts/fetch-sources.mjs from OpenStreetMap (© OpenStreetMap contributors, ODbL 1.0): metro, Marmaray, train, tram and funicular stations in ${city.name}, for the "Raylı sisteme yakın" filter.`,
      items: railItems,
    });
    if (wrote) log(`- ${files.rail}: ${railItems.length} istasyon.`);
  } else {
    log(`- Raylı istasyon listesi alınamadı; ${files.rail} değiştirilmedi.`);
  }

  // --- Food places ---------------------------------------------------------

  log('');
  log(H('Yeme-içme yerleri (OpenStreetMap, inceleme verisi)'));
  log('');
  const foodEls = await queryBig(FOOD_QUERY, L('yeme-içme'), city.tiled?.foodMin, city.tiled?.foodMinOk);
  if (foodEls && foodEls.length > 0) {
    const parsed = foodEls.map(fromFood).filter(Boolean);
    const all = parsed.filter((f) => usableFoodName(f.n));
    log(`- Ayıklanan (anlamsız ad / yeme-içme dışı): ${parsed.length - all.length}`);
    // Same name (ignoring case and Turkish letters) within 50 m is one place,
    // e.g. a node plus a building outline; keep the record with the most details.
    // Wider would merge real chain branches (two Starbucks ~75 m apart).
    const detail = (f) => Object.keys(f).length;
    const food = [];
    // Kept places by folded name: same result as comparing against every kept
    // place, without O(n²) fold calls (İstanbul has tens of thousands).
    const keptByName = new Map();
    const sortedFood = [...all].sort(
      (x, y) => detail(y) - detail(x) || x.n.localeCompare(y.n, 'tr') || x.a - y.a || x.o - y.o,
    );
    for (const f of sortedFood) {
      const key = foldTr(f.n);
      const same = keptByName.get(key) ?? [];
      const dup = same.some(
        (q) => meters({ lat: q.a, lng: q.o }, { lat: f.a, lng: f.o }) <= 50,
      );
      if (dup) continue;
      same.push(f);
      keptByName.set(key, same);
      food.push(f);
    }
    food.sort((x, y) => x.n.localeCompare(y.n, 'tr') || x.a - y.a || x.o - y.o);
    const by = (key) => food.filter((f) => f[key] != null).length;
    const kinds = {};
    for (const f of food) kinds[f.k] = (kinds[f.k] ?? 0) + 1;
    const cuisines = {};
    for (const f of food) for (const c of f.c ?? []) cuisines[c] = (cuisines[c] ?? 0) + 1;
    const topCuisines = Object.entries(cuisines)
      .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
      .slice(0, 15)
      .map(([c, n]) => `${c} ${n}`)
      .join(', ');
    log(
      `- Toplam: ${food.length} (${Object.entries(kinds)
        .sort()
        .map(([k, n]) => `${k} ${n}`)
        .join(', ')})`,
    );
    log(
      `- Mutfak türü: ${pct(by('c'), food.length)}, çalışma saati: ${pct(by('h'), food.length)}, telefon: ${pct(by('p'), food.length)}, web: ${pct(by('w'), food.length)}, Instagram: ${pct(by('ig'), food.length)}`,
    );
    log(`- En sık mutfak türleri: ${topCuisines || '—'}`);
    const wrote = await writeData(files.food, {
      $comment:
        'Generated by scripts/fetch-sources.mjs. Restaurant list and detail data; the app bundles it for the restaurant screens. Keys: n name, a lat, o lng, k amenity or shop (bakery, pastry, confectionery), c cuisine[], dt diet[] (vegan = only, vegan_options = offers), h opening_hours, p phone, w website, ig instagram, ad address, out outdoor seating, wc wheelchair, res reservation. © OpenStreetMap contributors, ODbL 1.0.',
      items: food,
    });
    if (wrote) log(`- ${files.food}: ${food.length} yer.`);
  } else {
    log(`- Yeme-içme listesi alınamadı; ${files.food} değiştirilmedi.`);
  }

  // Other open sources: what the İzmir municipal portal has on food and tourism.
  if (izmir) {
    log('');
    log('## İzmir açık veri portalında yeme-içme / turizm veri setleri');
    log('');
    for (const q of ['restoran', 'lokanta', 'kafe', 'turizm', 'işletme']) {
      try {
        const r = await ckan('package_search', { q, rows: '20' });
        const titles = (r.results ?? [])
          .map((pkg) => pkg.title)
          .sort((x, y) => x.localeCompare(y, 'tr'));
        log(`- "${q}": ${titles.length ? titles.join(' · ') : 'sonuç yok'}`);
      } catch (e) {
        // Fixed text: a varying error message would change the report every run.
        console.warn(`CKAN "${q}": ${e.message}`);
        log(`- "${q}": arama başarısız`);
      }
    }
  }
}

// One city failing (even with an unexpected error) must not stop or corrupt the
// other: files are only written whole, after a city's data is complete.
for (const city of cities) {
  if (city !== cities[0]) log('');
  try {
    await runCity(city);
  } catch (e) {
    console.warn(`${city.name} başarısız:`, e);
    log('');
    log(`- ${city.name}: beklenmeyen hata (${e.message}); bu şehrin dosyaları değiştirilmedi.`);
  }
}

await writeFile(out('data/sources-report.md'), report.join('\n') + '\n');
