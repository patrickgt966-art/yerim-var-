import {
  CATEGORY_INFO,
  MAX_PARKING_ROWS,
  MAX_RESTAURANT_ROWS,
  MIN_ROWS,
  NON_RESTAURANT_KINDS,
  headersFile,
  areaPages,
  parkingRows,
  priceCell,
  restaurantRows,
  robotsTxt,
  sitemapXml,
  titleCase,
  type AreaInput,
  type Candidate,
  type PageContext,
  type SiteArea,
  type SiteParking,
  type SiteRestaurant,
  type TariffLike,
} from '../site/pages';

const CENTER = { lat: 38.4379, lng: 27.1435 };
const AREA: SiteArea = { name: 'Alsancak', slug: 'alsancak', kind: 'quarter' };
const CTX: PageContext = {
  city: { id: 'izmir', name: 'İzmir', locative: "İzmir'de", liveParking: true },
  env: { APP_STORE_URL: '' },
  credit: 'Veri: OpenStreetMap katkıcıları (ODbL).',
};

const park = (i: number, over: Partial<SiteParking> = {}): SiteParking => ({
  id: `osm-way-${i}`,
  name: `Park ${i}`,
  lat: CENTER.lat + i * 0.0005,
  lng: CENTER.lng,
  capacity: null,
  isPaid: null,
  address: null,
  ...over,
});

const rest = (i: number, over: Partial<SiteRestaurant> = {}): SiteRestaurant => ({
  id: `osm-n${i}`,
  name: `Lokanta ${i}`,
  lat: CENTER.lat,
  lng: CENTER.lng + i * 0.0005,
  kind: 'restaurant',
  address: null,
  ...over,
});

const official: TariffLike = {
  priceKind: 'official',
  hourly: 60,
  bands: [{ label: '0-1 saat', price: 60 }],
  source: 'İBB İSPARK',
  verifiedAt: '2026-10-18',
};

describe('priceCell: a price only from an official tariff', () => {
  it('shows the one-hour price with the source and its date', () => {
    expect(priceCell({ isPaid: true }, official)).toBe(
      '1 saat 60 ₺ · İBB İSPARK tarifesi, 18.10.2026',
    );
  });

  it('reads the price from the bands, not only the hourly field', () => {
    const banded: TariffLike = {
      ...official,
      hourly: null,
      bands: [{ label: '0-6 Saat', price: 100 }],
    };
    expect(priceCell({ isPaid: null }, banded)).toBe(
      '1 saat 100 ₺ · İBB İSPARK tarifesi, 18.10.2026',
    );
  });

  it('never prices from an estimated tariff', () => {
    expect(priceCell({ isPaid: true }, { ...official, priceKind: 'estimated' })).toBe(
      'Ücret bilgisi yok',
    );
  });

  it('says no price when there is no tariff, even for a paid car park', () => {
    expect(priceCell({ isPaid: true }, null)).toBe('Ücret bilgisi yok');
    expect(priceCell({ isPaid: null }, null)).toBe('Ücret bilgisi yok');
  });

  it('says free only when the data says the car park is free', () => {
    expect(priceCell({ isPaid: false }, null)).toBe('Ücretsiz');
  });

  it('leaves the date out when the tariff has none', () => {
    expect(priceCell({ isPaid: null }, { ...official, verifiedAt: null })).toBe(
      '1 saat 60 ₺ · İBB İSPARK tarifesi',
    );
  });
});

describe('parkingRows', () => {
  it('sorts by distance from the centre and caps at 20 rows', () => {
    const parks = Array.from({ length: 30 }, (_, i) => park(30 - i));
    const { rows, total } = parkingRows(CENTER, parks, () => null);
    expect(total).toBe(30);
    expect(rows).toHaveLength(MAX_PARKING_ROWS);
    expect(rows[0]!.parking.id).toBe('osm-way-1');
    expect(rows.map((r) => r.distanceM)).toEqual(
      [...rows.map((r) => r.distanceM)].sort((a, b) => a - b),
    );
  });

  it('prices only the car parks that have an official tariff', () => {
    const { rows } = parkingRows(CENTER, [park(1), park(2)], (id) =>
      id === 'osm-way-2' ? official : null,
    );
    expect(rows.map((r) => r.price)).toEqual([
      'Ücret bilgisi yok',
      '1 saat 60 ₺ · İBB İSPARK tarifesi, 18.10.2026',
    ]);
    expect(rows.map((r) => r.official)).toEqual([false, true]);
  });
});

describe('restaurantRows', () => {
  const cand = (i: number, parking: SiteParking): Candidate => ({ restaurant: rest(i), parking });

  it('sorts by the walk to the car park and caps at 30 rows', () => {
    const cands = Array.from({ length: 40 }, (_, i) =>
      cand(i, park(i, { lat: CENTER.lat + 0.0001 * (40 - i), lng: CENTER.lng + i * 0.0005 })),
    );
    const { rows, total, minWalk } = restaurantRows(cands);
    expect(total).toBe(40);
    expect(rows).toHaveLength(MAX_RESTAURANT_ROWS);
    expect(minWalk).toBe(rows[0]!.walk);
    expect(rows.map((r) => r.walk)).toEqual([...rows.map((r) => r.walk)].sort((a, b) => a - b));
  });

  it('counts only the restaurants that pass the filter', () => {
    const cands = [cand(1, park(1)), cand(2, park(2)), cand(3, park(3))];
    expect(restaurantRows(cands, (r) => r.id === 'osm-n2').total).toBe(1);
  });
});

describe('areaPages: a page type needs at least 3 rows', () => {
  const input = (over: Partial<AreaInput> = {}): AreaInput => ({
    center: CENTER,
    parkings: [],
    candidates: [],
    tariffOf: () => null,
    kindLabelOf: () => 'Restoran',
    inCategory: () => false,
    ...over,
  });
  const cands = (n: number): Candidate[] =>
    Array.from({ length: n }, (_, i) => ({ restaurant: rest(i + 1), parking: park(i + 1) }));

  it('makes no page from fewer than 3 rows', () => {
    expect(MIN_ROWS).toBe(3);
    const out = areaPages(CTX, AREA, input({ parkings: [park(1), park(2)], candidates: cands(2) }));
    expect(out.pages).toEqual([]);
    expect(out.links).toEqual([]);
  });

  it('makes the car park page from 3 car parks and the restaurant page from 3 restaurants', () => {
    const out = areaPages(
      CTX,
      AREA,
      input({ parkings: [park(1), park(2), park(3)], candidates: cands(3) }),
    );
    expect(out.pages.map((p) => p.path)).toEqual([
      '/izmir/alsancak-otopark',
      '/izmir/alsancak-restoran',
    ]);
  });

  it('makes a category page only when 3 restaurants fit the category', () => {
    const fish = CATEGORY_INFO.find((c) => c.id === 'fish')!;
    const two = areaPages(
      CTX,
      AREA,
      input({ candidates: cands(5), inCategory: (r, c) => c.id === 'fish' && r.id <= 'osm-n2' }),
    );
    expect(two.pages.map((p) => p.path)).toEqual(['/izmir/alsancak-restoran']);
    const three = areaPages(
      CTX,
      AREA,
      input({ candidates: cands(5), inCategory: (r, c) => c.id === fish.id && r.id <= 'osm-n3' }),
    );
    expect(three.pages.map((p) => p.path)).toEqual([
      '/izmir/alsancak-restoran',
      '/izmir/alsancak-balik',
    ]);
    const page = three.pages[1]!;
    expect(page.title).toBe("Alsancak'ta Balık Restoranları · Otoparkı Yakın | Yerim Var");
    expect(page.html).toContain('<h1>Alsancak&#39;ta balık restoranları</h1>');
    expect(page.html).toContain('Otoparkı yakın olanlar, yürüme süresiyle');
  });

  it('writes the titles, canonical link and intro the coordinator asked for', () => {
    const out = areaPages(
      CTX,
      AREA,
      input({ parkings: [park(1), park(2), park(3)], candidates: cands(3) }),
    );
    const [parking, restaurants] = out.pages;
    expect(parking!.title).toBe("Alsancak'ta Otopark · Ücret ve Kapasite | Yerim Var");
    expect(parking!.html).toContain('<h1>Alsancak&#39;ta otopark</h1>');
    expect(restaurants!.title).toBe("Alsancak'ta Restoranlar · Otoparkı Yakın | Yerim Var");
    expect(restaurants!.html).toContain('<h1>Alsancak&#39;ta restoranlar</h1>');
    expect(restaurants!.description).toBe(
      "Alsancak'taki restoranlar ve yanlarındaki otoparklar: en yakın otoparka kaç dakika yürüneceğini gör.",
    );
    expect(restaurants!.html).toContain(
      '<link rel="canonical" href="https://yerimvar.app/izmir/alsancak-restoran">',
    );
    expect(restaurants!.html).toMatch(
      /Alsancak&#39;ta 3 restoranın yanında otopark var; en yakını \d+ dk yürüme\./,
    );
    expect(restaurants!.html).toContain('href="/izmir/alsancak-otopark"');
    expect(restaurants!.html).toContain('href="/izmir"');
    expect(restaurants!.html).toContain("Yerim Var yakında App Store'da.");
  });

  it('keeps drink and dessert places off the restaurant page but on their category page', () => {
    const cafes: Candidate[] = Array.from({ length: 3 }, (_, i) => ({
      restaurant: rest(10 + i, { kind: 'cafe' }),
      parking: park(10 + i),
    }));
    const out = areaPages(
      CTX,
      AREA,
      input({
        candidates: [...cafes, ...cands(2)],
        inCategory: (r, c) => c.id === 'cafe' && r.kind === 'cafe',
      }),
    );
    // Only 2 real restaurants are left: no restaurant page, but the cafe page has its 3.
    expect(out.pages.map((p) => p.path)).toEqual(['/izmir/alsancak-kafe']);
    const withThree = areaPages(CTX, AREA, input({ candidates: [...cafes, ...cands(3)] }));
    const page = withThree.pages.find((p) => p.path.endsWith('-restoran'))!;
    expect(page.html).toContain('3 restoranın yanında');
    expect(page.html).not.toContain('osm-n10');
  });

  it('names the excluded kinds', () => {
    expect([...NON_RESTAURANT_KINDS].sort()).toEqual(
      ['bakery', 'bar', 'biergarten', 'cafe', 'confectionery', 'ice_cream', 'pastry', 'pub'].sort(),
    );
    for (const kind of ['restaurant', 'fast_food', 'food_court']) {
      expect(NON_RESTAURANT_KINDS.has(kind)).toBe(false);
    }
  });

  it('escapes names and never prints undefined or NaN', () => {
    const evil = `<b>"X" & 'Y'</b>`;
    const out = areaPages(
      CTX,
      AREA,
      input({
        parkings: [park(1, { name: evil }), park(2), park(3)],
        candidates: [
          { restaurant: rest(1, { name: evil }), parking: park(1, { name: evil }) },
          ...cands(3).slice(1),
        ],
      }),
    );
    for (const page of out.pages) {
      expect(page.html).not.toContain('<b>');
      expect(page.html).toContain('&lt;b&gt;&quot;X&quot; &amp; &#39;Y&#39;&lt;/b&gt;');
      expect(page.html).not.toMatch(/undefined|NaN/);
    }
  });
});

describe('headersFile', () => {
  it('gives every static page the security headers the Worker sets, and one hour of caching', () => {
    const txt = headersFile();
    expect(txt.startsWith('/*\n')).toBe(true);
    expect(txt).toContain(
      "  content-security-policy: default-src 'none'; style-src 'unsafe-inline'; img-src 'self'",
    );
    expect(txt).toContain('  x-content-type-options: nosniff');
    expect(txt).toContain('  referrer-policy: no-referrer');
    expect(txt).toContain('  cache-control: public, max-age=3600');
  });
});

describe('titles, sitemap and robots', () => {
  it('title-cases with Turkish capitals and keeps "ve"', () => {
    expect(titleCase('et ve ızgara restoranları')).toBe('Et ve Izgara Restoranları');
    expect(titleCase('iş yerleri')).toBe('İş Yerleri');
  });

  it('lists every path under https://yerimvar.app', () => {
    const xml = sitemapXml(['/', '/izmir', '/izmir/alsancak-otopark']);
    expect(xml).toContain('<loc>https://yerimvar.app/</loc>');
    expect(xml).toContain('<loc>https://yerimvar.app/izmir/alsancak-otopark</loc>');
  });

  it('allows all, names the sitemap and blocks the share pages and admin', () => {
    const txt = robotsTxt();
    expect(txt).toContain('Allow: /');
    expect(txt).toContain('Disallow: /r/');
    expect(txt).toContain('Disallow: /p/');
    expect(txt).toContain('Disallow: /admin');
    expect(txt).toContain('Sitemap: https://yerimvar.app/sitemap.xml');
  });
});
