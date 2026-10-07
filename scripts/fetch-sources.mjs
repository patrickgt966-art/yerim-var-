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
import { mkdir, writeFile } from 'node:fs/promises';
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
];

const OVERPASS_QUERY = `
[out:json][timeout:240];
area["boundary"="administrative"]["admin_level"="4"]["name"="İzmir"]->.izmir;
nwr["amenity"="parking"](area.izmir);
out center tags;
`;

async function overpass() {
  for (const url of OVERPASS) {
    try {
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'yerim-var data refresh (github.com/patrickgt966-art/yerim-var-)',
        },
        body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()).elements ?? [];
    } catch (e) {
      log(`- Overpass ${url} başarısız: ${e.message}`);
    }
  }
  return null;
}

const int = (v) => {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const round = (n) => Math.round(n * 1e6) / 1e6;

function fromOsm(el) {
  const t = el.tags ?? {};
  // Not usable by the public.
  if (['private', 'no'].includes(t.access)) return null;
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  const kind = t.parking ?? null;
  const street = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ');
  return {
    id: `osm-${el.type}-${el.id}`,
    name: t.name ?? t['name:tr'] ?? null,
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

// --- Live API reachability (for the report only) ---------------------------

async function liveApi() {
  const started = Date.now();
  try {
    const res = await fetchWithTimeout(
      'https://openapi.izmir.bel.tr/api/ibb/izum/otoparklar',
      {},
      60_000,
    );
    const body = await res.json();
    return `HTTP ${res.status}, ${Array.isArray(body) ? body.length : '?'} kayıt, ${Date.now() - started} ms`;
  } catch (e) {
    return `başarısız (${e.message}, ${Date.now() - started} ms)`;
  }
}

// --- main ------------------------------------------------------------------

await mkdir(out('data/raw'), { recursive: true });
log(`# Veri kaynakları raporu`);
log('');
log(`Oluşturma: ${new Date().toISOString()}`);
log('');

const elements = await overpass();
const osm = (elements ?? []).map(fromOsm).filter(Boolean);
log('## OpenStreetMap (ODbL)');
log('');
if (elements) {
  const named = osm.filter((p) => p.name).length;
  const withCap = osm.filter((p) => p.capacity).length;
  const paid = osm.filter((p) => p.isPaid === true).length;
  log(`- Ham öğe: ${elements.length}, herkese açık: ${osm.length}`);
  log(`- Adı olan: ${named}, kapasitesi olan: ${withCap}, ücretli işaretli: ${paid}`);
}
log('');

const ckanFound = await portal();
log('## İzmir açık veri portalı ("otopark" araması)');
log('');
for (const r of ckanFound ?? []) {
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

if (elements) {
  osm.sort((a, b) => a.id.localeCompare(b.id));
  const file = {
    $comment:
      'Generated by scripts/fetch-sources.mjs. OpenStreetMap data © OpenStreetMap contributors, ODbL 1.0.',
    generatedAt: new Date().toISOString(),
    licenses: { osm: 'ODbL-1.0' },
    parkings: osm,
  };
  await writeFile(out('data/parkings-static.json'), JSON.stringify(file) + '\n');
  log(`data/parkings-static.json: ${osm.length} otopark yazıldı.`);
} else {
  log('OpenStreetMap alınamadı; data/parkings-static.json değiştirilmedi.');
}
await writeFile(out('data/sources-report.md'), report.join('\n') + '\n');
