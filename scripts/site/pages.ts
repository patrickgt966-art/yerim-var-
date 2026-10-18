// The static SEO pages of yerimvar.app as pure functions: data in, HTML strings out. No file
// access and no app state, so the rules (at least 3 rows, a price only from an official tariff)
// can be tested with small fixtures. scripts/build-site.ts loads the data and writes the files.
import { distanceMeters, walkMinutes, type LatLng } from '@/data/geo';
import { estimateCost, tariffCost, type Tariff } from '@/data/tariffs';
import { shareLink } from '@/lib/share';

import {
  appButton,
  CSP,
  documentHtml,
  securityHeaders,
  esc,
  LOGO,
  type SiteEnv,
} from '../../server/yerim-ai/src/siteShell';
import { locative, slugify } from './turkish';

export const SITE_URL = 'https://yerimvar.app';
/** A page type needs at least this many rows to exist. */
export const MIN_ROWS = 3;
export const MAX_PARKING_ROWS = 20;
export const MAX_RESTAURANT_ROWS = 30;
/** The price column shows the cost of this stay. */
const PRICE_MINUTES = 60;

/** What the pages need of a car park (a subset of the app's Parking). */
export type SiteParking = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  capacity: number | null;
  isPaid: boolean | null;
  address: string | null;
};

/** The tariff fields the price cell reads. */
export type TariffLike = Pick<
  Tariff,
  'priceKind' | 'hourly' | 'bands' | 'freeMinutes' | 'source' | 'verifiedAt'
>;

/** What the pages need of a restaurant (a subset of the app's Restaurant). */
export type SiteRestaurant = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  kind: string;
  address: string | null;
};

/** A restaurant with the nearest car park within the app's radius. */
export type Candidate = { restaurant: SiteRestaurant; parking: SiteParking };

export type SiteCity = { id: string; name: string; locative: string; liveParking: boolean };
export type SiteArea = { name: string; slug: string; kind: 'district' | 'quarter' };

/** A food category as the pages name it (the app's own labels do not fit a title). */
export type CategoryInfo = {
  id: string;
  /** Short folded-to-slug word: "Balık" -> "balik" (the page is /<city>/<area>-balik). */
  slugWord: string;
  /** "balık restoranları": the plural in a title and heading. */
  plural: string;
  /** "balık restoranı": one such place, for counts ("8 balık restoranı"). */
  singular: string;
};

export const CATEGORY_INFO: readonly CategoryInfo[] = [
  { id: 'breakfast', slugWord: 'kahvaltı', plural: 'kahvaltı yerleri', singular: 'kahvaltı yeri' },
  { id: 'soup', slugWord: 'çorba', plural: 'çorbacılar', singular: 'çorbacı' },
  {
    id: 'meat',
    slugWord: 'et-ızgara',
    plural: 'et ve ızgara restoranları',
    singular: 'et ve ızgara restoranı',
  },
  { id: 'lokanta', slugWord: 'lokanta', plural: 'lokantalar', singular: 'lokanta' },
  { id: 'fish', slugWord: 'balık', plural: 'balık restoranları', singular: 'balık restoranı' },
  { id: 'cafe', slugWord: 'kafe', plural: 'kafeler', singular: 'kafe' },
  { id: 'meyhane', slugWord: 'meyhane', plural: 'meyhaneler', singular: 'meyhane' },
  {
    id: 'fast',
    slugWord: 'hızlı-yemek',
    plural: 'hızlı yemek yerleri',
    singular: 'hızlı yemek yeri',
  },
  {
    id: 'world',
    slugWord: 'dünya-mutfağı',
    plural: 'dünya mutfağı restoranları',
    singular: 'dünya mutfağı restoranı',
  },
  {
    id: 'dessert',
    slugWord: 'tatlı',
    plural: 'tatlı ve dondurma yerleri',
    singular: 'tatlı ve dondurma yeri',
  },
];

/** "balık restoranları" -> "Balık Restoranları" (Turkish capitals: "ızgara" -> "Izgara"; "ve" stays). */
export function titleCase(s: string): string {
  return s
    .split(' ')
    .map((w) => (w === 've' ? w : w.charAt(0).toLocaleUpperCase('tr') + w.slice(1)))
    .join(' ');
}

// --- URLs -------------------------------------------------------------------------------------

export const cityPath = (city: SiteCity): string => `/${city.id}`;
export const areaPath = (city: SiteCity, area: SiteArea, type: string): string =>
  `/${city.id}/${area.slug}-${type}`;

/** The page type segment: "otopark", "restoran" or a category's slug word folded ("balik"). */
export const typeSlug = (type: 'otopark' | 'restoran' | CategoryInfo): string =>
  typeof type === 'string' ? type : slugify(type.slugWord);

// --- Rules ------------------------------------------------------------------------------------

const meters = (m: number): string =>
  m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;

/** "2026-02-16" -> "16.02.2026"; anything else is dropped. */
function trDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

/**
 * The price cell and whether it is a price. A price appears only when `tariff` is an official one
 * that gives a cost for a one-hour stay: "1 saat 60 ₺ · <source> tarifesi, 16.02.2026".
 * "Ücretsiz" only when the data says the car park is free (isPaid === false). Otherwise
 * "Ücret bilgisi yok". Never an estimate.
 */
export function priceInfo(
  p: Pick<SiteParking, 'isPaid'>,
  tariff: TariffLike | null,
): { text: string; official: boolean } {
  if (tariff && tariff.priceKind === 'official') {
    const cost =
      tariffCost(tariff as Tariff, PRICE_MINUTES) ?? estimateCost(tariff.hourly, PRICE_MINUTES);
    if (cost != null) {
      const date = trDate(tariff.verifiedAt);
      const credit = `${tariff.source} tarifesi${date ? `, ${date}` : ''}`;
      return {
        text: cost === 0 ? `Ücretsiz · ${credit}` : `1 saat ${cost} ₺ · ${credit}`,
        official: true,
      };
    }
  }
  return { text: p.isPaid === false ? 'Ücretsiz' : 'Ücret bilgisi yok', official: false };
}

export const priceCell = (p: Pick<SiteParking, 'isPaid'>, tariff: TariffLike | null): string =>
  priceInfo(p, tariff).text;

export type ParkingRow = {
  parking: SiteParking;
  distanceM: number;
  price: string;
  official: boolean;
};

/** The car parks nearest the centre, at most MAX_PARKING_ROWS; `total` counts all of them. */
export function parkingRows(
  center: LatLng,
  parkings: readonly SiteParking[],
  tariffOf: (id: string) => TariffLike | null,
): { rows: ParkingRow[]; total: number } {
  const all = parkings
    .map((parking) => ({ parking, distanceM: distanceMeters(center, parking) }))
    .sort(
      (a, b) => a.distanceM - b.distanceM || a.parking.name.localeCompare(b.parking.name, 'tr'),
    );
  const rows = all.slice(0, MAX_PARKING_ROWS).map((x) => {
    const tariff = tariffOf(x.parking.id);
    const info = priceInfo(x.parking, tariff);
    return { ...x, price: info.text, official: info.official };
  });
  return { rows, total: all.length };
}

/**
 * Kinds of the app's food list that are drink or dessert places, not restaurants: they stay off the
 * "restoranlar" page and show only on their own category pages (kafe, meyhane, tatlı). The kinds
 * that stay are restaurant, fast_food and food_court.
 */
export const NON_RESTAURANT_KINDS: ReadonlySet<string> = new Set([
  'cafe',
  'bar',
  'pub',
  'biergarten',
  'ice_cream',
  'bakery',
  'pastry',
  'confectionery',
]);

export const isRestaurantKind = (kind: string): boolean => !NON_RESTAURANT_KINDS.has(kind);

export type RestaurantRowData = { restaurant: SiteRestaurant; parking: SiteParking; walk: number };

/** Candidates (optionally filtered) sorted by the walk from the car park; `total` counts all. */
export function restaurantRows(
  candidates: readonly Candidate[],
  filter?: (r: SiteRestaurant) => boolean,
): { rows: RestaurantRowData[]; total: number; minWalk: number } {
  const all = candidates
    .filter((c) => !filter || filter(c.restaurant))
    .map((c) => ({ ...c, walk: walkMinutes(c.restaurant, c.parking) }))
    .sort(
      (a, b) =>
        a.walk - b.walk ||
        distanceMeters(a.restaurant, a.parking) - distanceMeters(b.restaurant, b.parking) ||
        a.restaurant.name.localeCompare(b.restaurant.name, 'tr') ||
        a.restaurant.id.localeCompare(b.restaurant.id),
    );
  return {
    rows: all.slice(0, MAX_RESTAURANT_ROWS),
    total: all.length,
    minWalk: all[0]?.walk ?? 0,
  };
}

// --- HTML -------------------------------------------------------------------------------------

export type PageOut = { path: string; title: string; description: string; html: string };

/** Everything a page of one city shares. */
export type PageContext = { city: SiteCity; env: SiteEnv; credit: string };

const NOTE = 'Bilgiler eksik ya da eski olabilir; uygulamadan bildirebilirsin.';

function frame(
  ctx: PageContext,
  p: { path: string; title: string; description: string; body: string },
): PageOut {
  const url = `${SITE_URL}${p.path}`;
  const head =
    `<meta name="description" content="${esc(p.description)}">` +
    `<link rel="canonical" href="${esc(url)}">` +
    `<meta property="og:title" content="${esc(p.title)}">` +
    `<meta property="og:description" content="${esc(p.description)}">` +
    `<meta property="og:image" content="${SITE_URL}/og.png">` +
    `<meta property="og:url" content="${esc(url)}">` +
    `<meta property="og:type" content="website">` +
    `<meta property="og:locale" content="tr_TR">` +
    `<meta name="twitter:card" content="summary">`;
  const footer = `<p>${esc(ctx.credit)}</p><p>${esc(NOTE)}</p>`;
  return {
    path: p.path,
    title: p.title,
    description: p.description,
    html: documentHtml({ title: p.title, head, body: p.body, env: ctx.env, wide: true, footer }),
  };
}

const link = (href: string, text: string): string => `<a href="${esc(href)}">${esc(text)}</a>`;

const parkingLink = (p: SiteParking): string =>
  link(shareLink('p', { id: p.id, name: p.name, lat: p.lat, lng: p.lng }), p.name);
const restaurantLink = (r: SiteRestaurant): string =>
  link(shareLink('r', { id: r.id, name: r.name, lat: r.lat, lng: r.lng }), r.name);

function crumbs(ctx: PageContext, area?: SiteArea): string {
  const parts = [link('/', 'Yerim Var'), link(cityPath(ctx.city), ctx.city.name)];
  if (area) parts.push(esc(area.name));
  return `<p class="note">${parts.join(' › ')}</p>`;
}

function openInApp(env: SiteEnv, text: string): string {
  return `<h2>Yerim Var'da aç</h2><p>${esc(text)}</p>${appButton(env)}`;
}

/** The other page types of the area (those that exist) and the city page. */
function siblingLinks(
  ctx: PageContext,
  area: SiteArea,
  exist: readonly { type: string; label: string }[],
  self: string,
): string {
  const items = exist
    .filter((e) => e.type !== self)
    .map((e) => `<li>${link(areaPath(ctx.city, area, e.type), e.label)}</li>`);
  items.push(`<li>${link(cityPath(ctx.city), `${ctx.city.name} semtleri`)}</li>`);
  return `<h2>${esc(area.name)} için diğer sayfalar</h2><ul class="links">${items.join('')}</ul>`;
}

export type PageLink = { type: string; label: string };

export function parkingPage(
  ctx: PageContext,
  area: SiteArea,
  data: { rows: ParkingRow[]; total: number },
  siblings: readonly PageLink[],
  hasRestaurants: boolean,
): PageOut {
  const loc = locative(area.name);
  const h1 = `${loc} otopark`;
  const title = `${loc} Otopark · Ücret ve Kapasite | Yerim Var`;
  const nearest = data.rows[0]?.distanceM ?? 0;
  const official = data.rows.filter((r) => r.official).length;
  const intro =
    `${loc} merkeze en yakın ${data.rows.length} otopark listelendi` +
    (data.total > data.rows.length ? ` (bölgede toplam ${data.total} kayıt var)` : '') +
    `; en yakını ${meters(nearest)} uzakta. ` +
    (official > 0
      ? `${official} tanesinde resmi tarife var; ücret yazmayanlarda tarife bilgisi yok.`
      : 'Hiçbirinde resmi tarife bilgisi yok.') +
    (ctx.city.liveParking
      ? ` ${ctx.city.locative} bazı otoparkların canlı boş yer sayısı uygulamada görünür.`
      : '');
  const description =
    `${loc}ki otoparklar: merkeze uzaklık, kapasite ve resmi tarifesi olanlarda 1 saatlik ücret.` +
    (hasRestaurants ? ' Otoparkı yakın restoranlar da var.' : '');
  const tr = data.rows
    .map(
      (r) =>
        `<tr><td>${parkingLink(r.parking)}</td><td>${esc(meters(r.distanceM))}</td>` +
        `<td>${r.parking.capacity != null && r.parking.capacity > 0 ? r.parking.capacity : '–'}</td>` +
        `<td>${esc(r.price)}</td></tr>`,
    )
    .join('');
  const body =
    crumbs(ctx, area) +
    `<div class="card">${LOGO}<h1>${esc(h1)}</h1>` +
    `<p class="kind">Merkeze yakın otoparklar, kapasite ve resmi ücretle</p>` +
    `<p>${esc(intro)}</p>` +
    `<div class="scroll"><table><thead><tr><th>Otopark</th><th>Merkeze uzaklık</th><th>Kapasite</th><th>Ücret</th></tr></thead>` +
    `<tbody>${tr}</tbody></table></div>` +
    `<p class="note">Ücret yalnızca işletmenin yayımladığı resmi tarife varsa yazılır; tahmin yapmıyoruz.</p>` +
    siblingLinks(ctx, area, siblings, 'otopark') +
    openInApp(
      ctx.env,
      `${area.name} çevresindeki otoparkları ve restoranları Yerim Var uygulamasında haritada gör.`,
    ) +
    `</div>`;
  return frame(ctx, { path: areaPath(ctx.city, area, 'otopark'), title, description, body });
}

/** The restaurant page of an area (`category` undefined) or of one food category. */
export function restaurantPage(
  ctx: PageContext,
  area: SiteArea,
  data: { rows: RestaurantRowData[]; total: number; minWalk: number },
  kindLabelOf: (kind: string) => string | null,
  siblings: readonly PageLink[],
  category?: CategoryInfo,
): PageOut {
  const loc = locative(area.name);
  const plural = category ? category.plural : 'restoranlar';
  const h1 = `${loc} ${plural}`;
  const title = `${loc} ${titleCase(plural)} · Otoparkı Yakın | Yerim Var`;
  const description = `${loc}ki ${plural} ve yanlarındaki otoparklar: en yakın otoparka kaç dakika yürüneceğini gör.`;
  const intro =
    (category
      ? `${loc} otoparkı yakın ${data.total} ${category.singular} var`
      : `${loc} ${data.total} restoranın yanında otopark var`) +
    `; en yakını ${data.minWalk} dk yürüme.` +
    (data.total > data.rows.length
      ? ` Listede yürüme süresi en kısa ${data.rows.length} yer var.`
      : '');
  const li = data.rows
    .map((r) => {
      const kind = kindLabelOf(r.restaurant.kind);
      return (
        `<li>${restaurantLink(r.restaurant)}${kind ? ` <span class="sub">${esc(kind)}</span>` : ''}` +
        `<span class="sub">🅿️ ${r.walk} dk yürüme · ${parkingLink(r.parking)}</span></li>`
      );
    })
    .join('');
  const body =
    crumbs(ctx, area) +
    `<div class="card">${LOGO}<h1>${esc(h1)}</h1>` +
    `<p class="kind">Otoparkı yakın olanlar, yürüme süresiyle</p>` +
    `<p>${esc(intro)}</p>` +
    `<ul class="rows">${li}</ul>` +
    `<p class="note">Yürüme süreleri düz mesafeden hesaplanan yaklaşık değerlerdir.</p>` +
    siblingLinks(ctx, area, siblings, category ? typeSlug(category) : 'restoran') +
    openInApp(
      ctx.env,
      `Restoranın yanındaki otoparkı, yürüyüş süresini ve yol tarifini Yerim Var uygulamasında gör.`,
    ) +
    `</div>`;
  const type = category ? typeSlug(category) : 'restoran';
  return frame(ctx, { path: areaPath(ctx.city, area, type), title, description, body });
}

export type AreaInput = {
  center: LatLng;
  /** The car parks that belong to the area. */
  parkings: readonly SiteParking[];
  /** The area's restaurants, each with its nearest car park within the app's radius. */
  candidates: readonly Candidate[];
  tariffOf: (id: string) => TariffLike | null;
  kindLabelOf: (kind: string) => string | null;
  /** Whether a restaurant belongs to a food category (the app's matchesCategory). */
  inCategory: (r: SiteRestaurant, category: CategoryInfo) => boolean;
};

/**
 * The pages of one area. A page type exists only with at least MIN_ROWS rows: car parks for the
 * car park page, restaurants with a car park nearby for the restaurant and category pages.
 */
export function areaPages(
  ctx: PageContext,
  area: SiteArea,
  input: AreaInput,
): { pages: PageOut[]; links: PageLink[] } {
  const parking = parkingRows(input.center, input.parkings, input.tariffOf);
  const all = restaurantRows(input.candidates, (r) => isRestaurantKind(r.kind));
  const cats = CATEGORY_INFO.map((category) => ({
    category,
    data: restaurantRows(input.candidates, (r) => input.inCategory(r, category)),
  })).filter((c) => c.data.total >= MIN_ROWS);

  const links: PageLink[] = [];
  if (parking.total >= MIN_ROWS) links.push({ type: 'otopark', label: 'Otopark' });
  if (all.total >= MIN_ROWS) links.push({ type: 'restoran', label: 'Restoranlar' });
  for (const c of cats) {
    links.push({ type: typeSlug(c.category), label: titleCase(c.category.plural) });
  }

  const pages: PageOut[] = [];
  if (parking.total >= MIN_ROWS) {
    pages.push(parkingPage(ctx, area, parking, links, all.total >= MIN_ROWS));
  }
  if (all.total >= MIN_ROWS) {
    pages.push(restaurantPage(ctx, area, all, input.kindLabelOf, links));
  }
  for (const c of cats) {
    pages.push(restaurantPage(ctx, area, c.data, input.kindLabelOf, links, c.category));
  }
  return { pages, links };
}

export type AreaWithPages = { area: SiteArea; pages: PageLink[] };

/** /<city>: the city's areas with links to their pages. */
export function cityPage(ctx: PageContext, areas: readonly AreaWithPages[]): PageOut {
  const { city } = ctx;
  const title = `${city.locative} Otopark ve Restoran Rehberi | Yerim Var`;
  const description = `${city.locative} semt ve ilçe bazında otoparklar, resmi tarifeler ve otoparkı yakın restoranlar.`;
  const section = (heading: string, kind: SiteArea['kind']): string => {
    const list = areas.filter((a) => a.area.kind === kind);
    if (list.length === 0) return '';
    const items = list
      .map(
        (a) =>
          `<li><strong>${esc(a.area.name)}</strong>: ` +
          a.pages.map((p) => link(areaPath(city, a.area, p.type), p.label)).join(' · ') +
          '</li>',
      )
      .join('');
    return `<h2>${esc(heading)}</h2><ul class="rows">${items}</ul>`;
  };
  const body =
    `<p class="note">${link('/', 'Yerim Var')} › ${esc(city.name)}</p>` +
    `<div class="card">${LOGO}<h1>${esc(`${city.locative} otopark ve restoran`)}</h1>` +
    `<p class="kind">Semt ve ilçe seç</p>` +
    `<p>${esc(`${city.name} için ${areas.length} bölgenin otopark ve restoran sayfaları.`)}</p>` +
    section('Semtler', 'quarter') +
    section('İlçeler', 'district') +
    openInApp(
      ctx.env,
      `${city.name} için: gideceğin yerin yanında park yeri var mı, gitmeden uygulamada gör.`,
    ) +
    `</div>`;
  return frame(ctx, { path: cityPath(city), title, description, body });
}

// --- Headers ----------------------------------------------------------------------------------

/**
 * The _headers file of Workers Static Assets: the headers the Worker sets on its own HTML pages
 * (CSP, nosniff, referrer policy, one hour of caching) for every static page.
 */
export function headersFile(): string {
  const headers: Record<string, string> = {
    ...securityHeaders(CSP),
    'cache-control': 'public, max-age=3600',
  };
  const lines = Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`);
  return `/*\n${lines.join('\n')}\n`;
}

// --- Sitemap and robots -----------------------------------------------------------------------

/** sitemap.xml for the given paths ('/' is the home page). */
export function sitemapXml(paths: readonly string[]): string {
  const urls = paths.map((p) => `<url><loc>${esc(`${SITE_URL}${p}`)}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export const robotsTxt = (): string => `User-agent: *
Allow: /
Disallow: /r/
Disallow: /p/
Disallow: /admin

Sitemap: ${SITE_URL}/sitemap.xml
`;
