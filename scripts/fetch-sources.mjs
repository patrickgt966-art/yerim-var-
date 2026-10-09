// Collects static parking data for İzmir province from open sources and
// writes data/parkings-static.json plus data/sources-report.md.
//
// Runs in GitHub Actions (.github/workflows/data-refresh.yml); the app never
// calls these services itself. Sources:
// - OpenStreetMap via Overpass (ODbL): amenity=parking in İzmir province.
// - İzmir open data portal (CKAN, CC BY 4.0): every dataset matching
//   "otopark" is downloaded to data/raw/ for review; known ones are merged.
//
// Usage: node scripts/fetch-sources.mjs
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

const IZMIR_AREA = 'area["boundary"="administrative"]["admin_level"="4"]["name"="İzmir"]->.izmir;';

const PARKING_QUERY = `
[out:json][timeout:240];
${IZMIR_AREA}
nwr["amenity"="parking"](area.izmir);
out center tags;
`;

// Named places people type into search: districts, neighbourhoods, malls,
// hospitals, universities, piers, stations, landmarks. Apple's on-device
// geocoder only knows addresses, so "İstinye" alone finds nothing.
const PLACES_QUERY = `
[out:json][timeout:240];
${IZMIR_AREA}
(
  node["place"~"^(city|town|suburb|quarter|neighbourhood|village)$"]["name"](area.izmir);
  nwr["shop"="mall"]["name"](area.izmir);
  nwr["amenity"~"^(hospital|university|college|ferry_terminal|bus_station|marketplace|theatre|townhall|courthouse)$"]["name"](area.izmir);
  nwr["tourism"~"^(attraction|museum|theme_park|zoo|hotel)$"]["name"](area.izmir);
  nwr["railway"~"^(station|halt)$"]["name"](area.izmir);
  nwr["leisure"~"^(stadium|park|marina|beach_resort)$"]["name"](area.izmir);
  nwr["historic"]["name"](area.izmir);
);
out center tags;
`;

// Places to eat and drink, for the "Restoran + park" idea (docs/ROADMAP.md).
// Collected for review only; the app does not use this file yet.
const FOOD_QUERY = `
[out:json][timeout:240];
${IZMIR_AREA}
nwr["amenity"~"^(restaurant|cafe|fast_food|bar|pub|ice_cream|food_court|biergarten)$"]["name"](area.izmir);
out center tags;
`;

// One shared budget for every Overpass query so a slow day cannot run past
// the workflow's timeout; later queries simply fail and keep their old file.
const OVERPASS_DEADLINE = Date.now() + 20 * 60_000;

async function overpass(query, label) {
  // Public Overpass servers are often busy (HTTP 429/5xx); retry with a pause.
  const outOfTime = () => {
    if (Date.now() <= OVERPASS_DEADLINE) return false;
    console.warn(`Overpass süre bütçesi doldu (${label}).`);
    return true;
  };
  for (let round = 0; round < 3 && !outOfTime(); round++) {
    if (round > 0) await new Promise((r) => setTimeout(r, 30_000 * round));
    for (const url of OVERPASS) {
      if (outOfTime()) break;
      try {
        const res = await fetchWithTimeout(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'yerim-var data refresh (github.com/patrickgt966-art/yerim-var-)',
          },
          body: `data=${encodeURIComponent(query)}`,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        // Overpass reports timeouts/out-of-memory as HTTP 200 + a remark
        // with partial results; never ship those.
        if (body.remark) throw new Error(`kısmi sonuç: ${body.remark}`);
        return body.elements ?? [];
      } catch (e) {
        // Console only: retries vary per run and must not change the report.
        console.warn(`Overpass ${url} başarısız (tur ${round + 1}): ${e.message}`);
      }
    }
  }
  log(`- Overpass alınamadı (${label}; tüm sunucular ve denemeler).`);
  return null;
}

const int = (v) => {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const round = (n) => Math.round(n * 1e6) / 1e6;

function fromOsm(el) {
  const t = el.tags ?? {};
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
    isIndoor: ['multi-storey', 'underground'].includes(kind)
      ? true
      : kind === 'surface'
        ? false
        : null,
    nonstop: t.opening_hours === '24/7' ? true : null,
    openingHoursText: t.opening_hours && t.opening_hours !== '24/7' ? t.opening_hours : null,
    operator: t.operator ?? null,
    address: street || t['addr:full'] || null,
    access: t.access === 'customers' ? 'customers' : null,
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
  return {
    id: `izelman-${resourceId.slice(0, 8)}-${row._id}`,
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
}

// --- Places for search --------------------------------------------------

function placeKind(t) {
  if (t.place) return ['city', 'town', 'village'].includes(t.place) ? 'town' : 'area';
  if (t.shop === 'mall') return 'mall';
  if (t.amenity === 'hospital') return 'hospital';
  if (['university', 'college'].includes(t.amenity)) return 'university';
  if (t.amenity === 'ferry_terminal') return 'pier';
  if (t.amenity === 'bus_station' || t.railway) return 'station';
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
    k: t.amenity,
    c: cuisine.length ? cuisine : null,
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

const elements = await overpass(PARKING_QUERY, 'otoparklar');
const osmAll = (elements ?? []).map(fromOsm).filter(Boolean);
// The same car park is often mapped twice (a node and an area).
const osm = dedupe(osmAll, 30, (p) => (p.name ? 2 : 0) + (p.capacity ? 1 : 0));
log('## OpenStreetMap (ODbL)');
log('');
if (elements) {
  log(
    `- Ham öğe: ${elements.length}, herkese açık: ${osmAll.length}, çiftler ayıklanınca: ${osm.length}`,
  );
  log(
    `- Adı olan: ${osm.filter((p) => p.name).length}, kapasitesi olan: ${osm.filter((p) => p.capacity).length}, ücretli işaretli: ${osm.filter((p) => p.isPaid === true).length}`,
  );
}
log('');

const ckanFound = await portal();
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

// Places first: they also name unnamed car parks ("Otopark · Bostanlı yakını").
const placeEls = await overpass(PLACES_QUERY, 'yer adları');
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
  (await readFile(out('data/places-izmir.json'), 'utf8')
    .then((txt) => JSON.parse(txt).items ?? [])
    .catch((e) => {
      log(`- Uyarı: yedek yer listesi okunamadı (${e.message}); adsız otoparklar adlandırılmadı.`);
      return [];
    }));

// Only public reference points. Hospitals, campuses, malls and hotels are
// left out: "Otopark · X yakını" next to them reads as if the car park
// belonged to them (and might be for their visitors only).
const LANDMARK_KINDS = new Set(['area', 'station', 'pier', 'landmark']);
// Names too common to point anywhere ("Çocuk Parkı yakını" could be any of
// hundreds) and residential buildings, which read as private property.
const GENERIC_LANDMARK =
  /^(?:(?:çocuk |halk )?park[ıi]?|dinlenme ve çocuk parkı|yeşil alan|merkez|pazar ?yeri|türbe|cami|(?:mustafa kemal )?atatürk (?:büstü|heykeli|anıtı)|şehitler anıtı)$|apartman[ıi]?$|\bapt\.?$|(?:^|\s)sitesi$/;
const usableLandmark = (n) =>
  n.length <= 28 && !/[()]/.test(n) && !GENERIC_LANDMARK.test(n.toLocaleLowerCase('tr').trim());
function nearestPlace(p, maxM = 250) {
  // Car parks restricted to customers/subscribers keep the plain name.
  if (p.access) return null;
  let best = null;
  let bestM = maxM;
  for (const q of namingPlaces) {
    if (!LANDMARK_KINDS.has(q.k) || !usableLandmark(q.n)) continue;
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
log('## Sonuç');
log('');
log(`- İzelman envanteri: ${izelman.length} otopark.`);

// Official records win over OSM points of the same car park.
const osmKept = osm
  .filter((o) => !izelman.some((z) => meters(o, z) <= 80))
  .map((o) => (o.name ? o : { ...o, near: nearestPlace(o) }));
log(`- OSM'den İzelman ile çakışan ${osm.length - osmKept.length} kayıt çıkarıldı.`);
log(`- Adsız otoparklardan yakın yer adı bulunan: ${osmKept.filter((o) => o.near).length}.`);

if (elements && izelman.length > 0) {
  const parkings = [...izelman, ...osmKept].sort((a, b) => a.id.localeCompare(b.id));
  const wrote = await writeData('data/parkings-static.json', {
    $comment:
      'Generated by scripts/fetch-sources.mjs. izelman-*: İzmir Büyükşehir Belediyesi Açık Veri (İzelman otopark envanteri). osm-*: © OpenStreetMap contributors, ODbL 1.0. near: nearest OSM place name within 250 m, for unnamed car parks.',
    licenses: { izelman: 'İzmir BB Açık Veri Lisansı', osm: 'ODbL-1.0' },
    parkings,
  });
  if (wrote) log(`- data/parkings-static.json: ${parkings.length} otopark.`);
} else {
  // Keep the previous file rather than ship a partial one.
  log('- Bir kaynak alınamadı; data/parkings-static.json değiştirilmedi.');
}

if (places) {
  const wrote = await writeData('data/places-izmir.json', {
    $comment:
      'Generated by scripts/fetch-sources.mjs for search. n=name, a=lat, o=lng, k=kind. © OpenStreetMap contributors, ODbL 1.0.',
    items: places,
  });
  if (wrote) log(`- data/places-izmir.json: ${places.length} yer (arama için).`);
} else {
  log('- Yer listesi alınamadı; data/places-izmir.json değiştirilmedi.');
}

// --- Food places -----------------------------------------------------------

log('');
log('## Yeme-içme yerleri (OpenStreetMap, inceleme verisi)');
log('');
const foodEls = await overpass(FOOD_QUERY, 'yeme-içme');
if (foodEls && foodEls.length > 0) {
  const parsed = foodEls.map(fromFood).filter(Boolean);
  const all = parsed.filter((f) => usableFoodName(f.n));
  log(`- Ayıklanan (anlamsız ad / yeme-içme dışı): ${parsed.length - all.length}`);
  // Same name (ignoring case and Turkish letters) within 50 m is one place,
  // e.g. a node plus a building outline; keep the record with the most details.
  // Wider would merge real chain branches (two Starbucks ~75 m apart).
  const detail = (f) => Object.keys(f).length;
  const food = [];
  const sortedFood = [...all].sort(
    (x, y) => detail(y) - detail(x) || x.n.localeCompare(y.n, 'tr') || x.a - y.a || x.o - y.o,
  );
  for (const f of sortedFood) {
    const dup = food.some(
      (q) =>
        foldTr(q.n) === foldTr(f.n) && meters({ lat: q.a, lng: q.o }, { lat: f.a, lng: f.o }) <= 50,
    );
    if (!dup) food.push(f);
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
  const wrote = await writeData('data/food-izmir.json', {
    $comment:
      'Generated by scripts/fetch-sources.mjs. Restaurant list and detail data; the app bundles it for the restaurant screens. Keys: n name, a lat, o lng, k amenity, c cuisine[], h opening_hours, p phone, w website, ig instagram, ad address, out outdoor seating, wc wheelchair, res reservation. © OpenStreetMap contributors, ODbL 1.0.',
    items: food,
  });
  if (wrote) log(`- data/food-izmir.json: ${food.length} yer.`);
} else {
  log('- Yeme-içme listesi alınamadı; data/food-izmir.json değiştirilmedi.');
}

// Other open sources: what the municipal portal has on food and tourism.
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

await writeFile(out('data/sources-report.md'), report.join('\n') + '\n');
