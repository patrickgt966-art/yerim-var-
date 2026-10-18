/**
 * Writes the static SEO pages of yerimvar.app to server/yerim-ai/public/ (served by Workers
 * Static Assets, see wrangler.toml [assets]): per area (each district and each quarter of the
 * five open cities) a car park page, a restaurant page and one page per food category, plus a
 * page per city, sitemap.xml and robots.txt. All from the app's own bundled data and helpers.
 *
 * Usage: npx tsx scripts/build-site.ts   (npm run site:build; `wrangler deploy` runs it first)
 * The page rules live in scripts/site/pages.ts, the Turkish helpers in scripts/site/turkish.ts.
 */
import './site/nativeStubs'; // must stay first: it stands in for react-native

import * as fs from 'node:fs';
import * as path from 'node:path';

import { init, t } from 'i18next';

import { CITIES, hasLiveParking, setActiveCity, type City } from '@/data/cities';
import { gridIndex, near, distanceMeters, type LatLng } from '@/data/geo';
import { CITY_QUARTERS } from '@/data/quarters';
import {
  FOOD_CATEGORIES,
  NEAREST_PARKING_RADIUS_M,
  allRestaurants,
  kindLabel,
  matchesCategory,
  nearestParking,
  type FoodCategory,
  type Restaurant,
} from '@/data/restaurants';
import { fold, resetSearchIndex, searchPlaces } from '@/data/search';
import { staticParkings } from '@/data/staticParkings';
import { tariffFor } from '@/data/tariffs';
import tr from '@/i18n/tr';

import type { SiteEnv } from '../server/yerim-ai/src/siteShell';
import {
  CATEGORY_INFO,
  areaPages,
  cityPage,
  headersFile,
  robotsTxt,
  sitemapXml,
  type AreaWithPages,
  type Candidate,
  type PageContext,
  type PageOut,
  type SiteArea,
  type SiteCity,
} from './site/pages';
import { slugify } from './site/turkish';

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'server/yerim-ai/public');
const WRANGLER = path.join(ROOT, 'server/yerim-ai/wrangler.toml');

/** A quarter is the car parks and restaurants within this many metres of its centre. */
const QUARTER_RADIUS_M = 1200;
/** A district has no district field in the data: within this many metres of its centre. */
const DISTRICT_RADIUS_M = 3000;

/** The data credit under every page, per city (wording from licenses/DATA.md). */
const MUNICIPAL_CREDIT: Record<string, string> = {
  izmir: 'İzmir Büyükşehir Belediyesi Açık Veri Portalı',
  istanbul: 'İBB Açık Veri / İSPARK',
  bursa: 'BURULAŞ',
};
const creditFor = (cityId: string): string =>
  'Veri: ' +
  ['OpenStreetMap katkıcıları (ODbL)', 'Overture Maps (CDLA-Permissive-2.0)']
    .concat(MUNICIPAL_CREDIT[cityId] ?? [])
    .join(', ') +
  '.';

/** APP_STORE_URL / APP_STORE_ID from wrangler.toml [vars]. */
function readEnv(): SiteEnv {
  const toml = fs.readFileSync(WRANGLER, 'utf8');
  const get = (key: string) => new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, 'm').exec(toml)?.[1] ?? '';
  return { APP_STORE_URL: get('APP_STORE_URL'), APP_STORE_ID: get('APP_STORE_ID') };
}

type Skip = { city: string; area: string; why: string };

/** The centre the app's place search gives the name: an exact name match that lies in the city. */
function centerOf(name: string): { center: LatLng } | { why: string } {
  const hits = searchPlaces(name, 6);
  if (hits.length === 0) return { why: 'the place search finds nothing' };
  const want = fold(name);
  const compact = (v: string): string => fold(v).replace(/ /g, '');
  // The name itself ("Sultanahmet" = "Sultan Ahmet"), else a place named after it ("Lara Plajı").
  const hit =
    hits.find((h) => !h.far && compact(h.name) === compact(name)) ??
    hits.find((h) => !h.far && fold(h.name).startsWith(`${want} `));
  if (!hit) {
    const top = hits[0]!;
    return { why: `no matching hit (top: ${top.name}${top.far ? ', outside the city' : ''})` };
  }
  return { center: { lat: hit.lat, lng: hit.lng } };
}

function areasOf(city: City): { area: SiteArea; name: string }[] {
  const districts: { area: SiteArea; name: string }[] = city.districts.map((name) => ({
    area: { name, slug: slugify(name), kind: 'district' },
    name,
  }));
  const taken = new Set(districts.map((d) => d.area.slug));
  const quarters: typeof districts = [];
  for (const q of CITY_QUARTERS[city.id] ?? []) {
    const slug = slugify(q.n);
    if (taken.has(slug)) continue; // a district of the same name wins
    taken.add(slug);
    quarters.push({ area: { name: q.n, slug, kind: 'quarter' }, name: q.n });
  }
  return [...quarters, ...districts];
}

function fileFor(urlPath: string, isCity: boolean): string {
  return path.join(OUT, isCity ? `${urlPath}/index.html` : `${urlPath}.html`);
}

async function main(): Promise<void> {
  await init({
    resources: { tr: { translation: tr } },
    lng: 'tr',
    fallbackLng: 'tr',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  if (JSON.stringify(CATEGORY_INFO.map((c) => c.id)) !== JSON.stringify(FOOD_CATEGORIES)) {
    throw new Error('CATEGORY_INFO in scripts/site/pages.ts must list FOOD_CATEGORIES in order');
  }

  const env = readEnv();
  const written = new Map<string, PageOut>();
  const cityPages: PageOut[] = [];
  const skipped: Skip[] = [];
  const counts: Record<string, Record<string, number>> = {};

  for (const city of CITIES.filter((c) => c.available)) {
    setActiveCity(city.id);
    resetSearchIndex();
    const siteCity: SiteCity = {
      id: city.id,
      name: city.name,
      locative: city.locative,
      liveParking: hasLiveParking(city),
    };
    const ctx: PageContext = { city: siteCity, env, credit: creditFor(city.id) };
    const count = (counts[city.id] = { otopark: 0, restoran: 0, kategori: 0, alan: 0 });

    const parkings = staticParkings();
    const restaurants = allRestaurants();
    const byId = new Map<string, Restaurant>(restaurants.map((r) => [r.id, r]));
    const parkIndex = gridIndex(parkings, 300);
    const withPark: Candidate[] = [];
    for (const r of restaurants) {
      const np = nearestParking(r, near(parkIndex, r, NEAREST_PARKING_RADIUS_M));
      if (np) withPark.push({ restaurant: r, parking: np.parking });
    }

    const done: AreaWithPages[] = [];
    for (const { area, name } of areasOf(city)) {
      const found = centerOf(name);
      if ('why' in found) {
        skipped.push({ city: city.id, area: name, why: found.why });
        continue;
      }
      const { center } = found;
      const inArea = (p: LatLng): boolean =>
        distanceMeters(center, p) <=
        (area.kind === 'quarter' ? QUARTER_RADIUS_M : DISTRICT_RADIUS_M);
      const out = areaPages(ctx, area, {
        center,
        parkings: parkings.filter(inArea),
        candidates: withPark.filter((c) => inArea(c.restaurant)),
        tariffOf: tariffFor,
        kindLabelOf: (kind) => kindLabel(kind, t),
        inCategory: (r, c) => matchesCategory(byId.get(r.id)!, c.id as FoodCategory),
      });
      if (out.pages.length === 0) {
        skipped.push({ city: city.id, area: name, why: 'no page type has 3 rows' });
        continue;
      }
      for (const page of out.pages) {
        if (written.has(page.path)) throw new Error(`two pages for ${page.path}`);
        written.set(page.path, page);
        if (page.path.endsWith('-otopark')) count.otopark++;
        else if (page.path.endsWith('-restoran')) count.restoran++;
        else count.kategori++;
      }
      count.alan++;
      done.push({ area, pages: out.links });
    }
    if (done.length > 0) {
      const page = cityPage(ctx, done);
      cityPages.push(page);
      written.set(page.path, page);
    }
  }

  fs.rmSync(OUT, { recursive: true, force: true });
  for (const page of written.values()) {
    const file = fileFor(page.path, cityPages.includes(page));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, page.html);
  }
  const sitemapPaths = ['/', ...[...written.keys()].sort()];
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), sitemapXml(sitemapPaths));
  fs.writeFileSync(path.join(OUT, 'robots.txt'), robotsTxt());
  fs.writeFileSync(path.join(OUT, '_headers'), headersFile());

  console.log(`site: ${written.size} pages -> ${path.relative(ROOT, OUT)}`);
  for (const [id, c] of Object.entries(counts)) {
    console.log(
      `  ${id}: ${c.alan} areas, otopark ${c.otopark}, restoran ${c.restoran}, kategori ${c.kategori}`,
    );
  }
  console.log(`  city pages: ${cityPages.length}, sitemap urls: ${sitemapPaths.length}`);
  console.log(`  skipped areas: ${skipped.length}`);
  for (const s of skipped) console.log(`    ${s.city}/${s.area}: ${s.why}`);
}

void main();
