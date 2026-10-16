import { distanceMeters, type LatLng } from './geo';
import type { DataSource } from './types';

/** A district (ilçe) with its centre; the centres are rough (a few km). */
export type District = { name: string; lat: number; lng: number };

export type CityBounds = { minLat: number; maxLat: number; minLng: number; maxLng: number };

/**
 * Example places for hints, chips and suggestions. `x` is the bare name, `xLoc` the name with its
 * locative suffix ("Bornova'da"): Turkish suffixes follow vowel harmony, so they are data.
 */
export type CityExamples = {
  a: string;
  aLoc: string;
  b: string;
  bLoc: string;
  c: string;
  cLoc: string;
  d: string;
  dLoc: string;
};

export type City = {
  id: string;
  name: string;
  /** Name with the locative suffix ("İzmir'de"): Turkish suffixes follow vowel harmony, so they are data. */
  locative: string;
  /** Places named in example texts; absent while the city is not open (İzmir's are used then). */
  examples?: CityExamples;
  /** Only cities with a working data source can be selected. */
  available: boolean;
  center: LatLng;
  /** Rough outline of the city's province: a useful search centre lies inside it. */
  bounds: CityBounds;
  /** Also required: within this many km of `center`. */
  radiusKm: number;
  /** Optional: westmost longitude per latitude band (highest lower bound first), to cut off the sea. */
  westLimits?: readonly [minLat: number, minLng: number][];
  /** District names; `districtCenters` holds the same districts with their centres. */
  districts: readonly string[];
  districtCenters: readonly District[];
  /** Parking source of the city; null while the city is not open. 'osm' (or another static kind) means no live API. */
  parkingSource: DataSource | null;
  /** Credit line for the parking data. */
  parkingAttribution: string | null;
};

export const DEFAULT_CITY = 'izmir';

export const IZMIR_CENTER: LatLng = { lat: 38.4237, lng: 27.1428 };

/** The 30 districts of İzmir. */
export const IZMIR_DISTRICTS: readonly District[] = [
  { name: 'Aliağa', lat: 38.7996, lng: 26.9707 },
  { name: 'Balçova', lat: 38.3889, lng: 27.05 },
  { name: 'Bayındır', lat: 38.2178, lng: 27.6478 },
  { name: 'Bayraklı', lat: 38.4622, lng: 27.1667 },
  { name: 'Bergama', lat: 39.1214, lng: 27.1799 },
  { name: 'Beydağ', lat: 38.0847, lng: 28.2108 },
  { name: 'Bornova', lat: 38.4697, lng: 27.2211 },
  { name: 'Buca', lat: 38.3886, lng: 27.175 },
  { name: 'Çeşme', lat: 38.3236, lng: 26.3031 },
  { name: 'Çiğli', lat: 38.495, lng: 27.07 },
  { name: 'Dikili', lat: 39.0717, lng: 26.8886 },
  { name: 'Foça', lat: 38.6703, lng: 26.7572 },
  { name: 'Gaziemir', lat: 38.3203, lng: 27.1311 },
  { name: 'Güzelbahçe', lat: 38.37, lng: 26.8911 },
  { name: 'Karabağlar', lat: 38.3758, lng: 27.13 },
  { name: 'Karaburun', lat: 38.6386, lng: 26.5122 },
  { name: 'Karşıyaka', lat: 38.4594, lng: 27.1153 },
  { name: 'Kemalpaşa', lat: 38.4269, lng: 27.4172 },
  { name: 'Kınık', lat: 39.0872, lng: 27.3828 },
  { name: 'Kiraz', lat: 38.2306, lng: 28.2047 },
  { name: 'Konak', lat: 38.4189, lng: 27.1287 },
  { name: 'Menderes', lat: 38.2552, lng: 27.1381 },
  { name: 'Menemen', lat: 38.6075, lng: 27.0697 },
  { name: 'Narlıdere', lat: 38.395, lng: 26.997 },
  { name: 'Ödemiş', lat: 38.2289, lng: 27.97 },
  { name: 'Seferihisar', lat: 38.1972, lng: 26.8383 },
  { name: 'Selçuk', lat: 37.9508, lng: 27.3681 },
  { name: 'Tire', lat: 38.0886, lng: 27.735 },
  { name: 'Torbalı', lat: 38.15, lng: 27.3616 },
  { name: 'Urla', lat: 38.3228, lng: 26.7647 },
];

/** The 39 districts of İstanbul. */
export const ISTANBUL_DISTRICTS: readonly District[] = [
  { name: 'Adalar', lat: 40.8761, lng: 29.1306 },
  { name: 'Arnavutköy', lat: 41.185, lng: 28.739 },
  { name: 'Ataşehir', lat: 40.9923, lng: 29.1244 },
  { name: 'Avcılar', lat: 40.9792, lng: 28.7214 },
  { name: 'Bağcılar', lat: 41.0391, lng: 28.8567 },
  { name: 'Bahçelievler', lat: 41.002, lng: 28.8597 },
  { name: 'Bakırköy', lat: 40.9819, lng: 28.8772 },
  { name: 'Başakşehir', lat: 41.093, lng: 28.802 },
  { name: 'Bayrampaşa', lat: 41.0345, lng: 28.912 },
  { name: 'Beşiktaş', lat: 41.0422, lng: 29.0067 },
  { name: 'Beykoz', lat: 41.1206, lng: 29.1 },
  { name: 'Beylikdüzü', lat: 41.002, lng: 28.642 },
  { name: 'Beyoğlu', lat: 41.037, lng: 28.977 },
  { name: 'Büyükçekmece', lat: 41.02, lng: 28.585 },
  { name: 'Çatalca', lat: 41.143, lng: 28.461 },
  { name: 'Çekmeköy', lat: 41.033, lng: 29.178 },
  { name: 'Esenler', lat: 41.043, lng: 28.876 },
  { name: 'Esenyurt', lat: 41.0343, lng: 28.68 },
  { name: 'Eyüpsultan', lat: 41.048, lng: 28.934 },
  { name: 'Fatih', lat: 41.0186, lng: 28.9397 },
  { name: 'Gaziosmanpaşa', lat: 41.062, lng: 28.915 },
  { name: 'Güngören', lat: 41.022, lng: 28.873 },
  { name: 'Kadıköy', lat: 40.991, lng: 29.027 },
  { name: 'Kağıthane', lat: 41.08, lng: 28.973 },
  { name: 'Kartal', lat: 40.889, lng: 29.19 },
  { name: 'Küçükçekmece', lat: 41.002, lng: 28.78 },
  { name: 'Maltepe', lat: 40.935, lng: 29.131 },
  { name: 'Pendik', lat: 40.877, lng: 29.233 },
  { name: 'Sancaktepe', lat: 41.002, lng: 29.23 },
  { name: 'Sarıyer', lat: 41.167, lng: 29.05 },
  { name: 'Silivri', lat: 41.074, lng: 28.246 },
  { name: 'Sultanbeyli', lat: 40.966, lng: 29.262 },
  { name: 'Sultangazi', lat: 41.107, lng: 28.867 },
  { name: 'Şile', lat: 41.175, lng: 29.613 },
  { name: 'Şişli', lat: 41.06, lng: 28.987 },
  { name: 'Tuzla', lat: 40.816, lng: 29.3 },
  { name: 'Ümraniye', lat: 41.0165, lng: 29.124 },
  { name: 'Üsküdar', lat: 41.023, lng: 29.015 },
  { name: 'Zeytinburnu', lat: 40.99, lng: 28.904 },
];

/** The 25 districts of Ankara (centres are rough, a few km). */
export const ANKARA_DISTRICTS: readonly District[] = [
  { name: 'Akyurt', lat: 40.1325, lng: 33.0889 },
  { name: 'Altındağ', lat: 39.9667, lng: 32.8667 },
  { name: 'Ayaş', lat: 40.0178, lng: 32.3358 },
  { name: 'Bala', lat: 39.5575, lng: 33.1233 },
  { name: 'Beypazarı', lat: 40.1675, lng: 31.9208 },
  { name: 'Çamlıdere', lat: 40.4903, lng: 32.4767 },
  { name: 'Çankaya', lat: 39.9179, lng: 32.8627 },
  { name: 'Çubuk', lat: 40.2378, lng: 33.0328 },
  { name: 'Elmadağ', lat: 39.9233, lng: 33.2336 },
  { name: 'Etimesgut', lat: 39.9553, lng: 32.6772 },
  { name: 'Evren', lat: 39.0233, lng: 33.8097 },
  { name: 'Gölbaşı', lat: 39.7894, lng: 32.8031 },
  { name: 'Güdül', lat: 40.2111, lng: 32.2486 },
  { name: 'Haymana', lat: 39.4333, lng: 32.4953 },
  { name: 'Kahramankazan', lat: 40.2058, lng: 32.6803 },
  { name: 'Kalecik', lat: 40.1, lng: 33.4103 },
  { name: 'Keçiören', lat: 39.981, lng: 32.864 },
  { name: 'Kızılcahamam', lat: 40.4694, lng: 32.6503 },
  { name: 'Mamak', lat: 39.925, lng: 32.9167 },
  { name: 'Nallıhan', lat: 40.1861, lng: 31.3519 },
  { name: 'Polatlı', lat: 39.5772, lng: 32.1411 },
  { name: 'Pursaklar', lat: 40.0397, lng: 32.9006 },
  { name: 'Sincan', lat: 39.9667, lng: 32.5833 },
  { name: 'Şereflikoçhisar', lat: 38.9381, lng: 33.5386 },
  { name: 'Yenimahalle', lat: 39.9667, lng: 32.8 },
];

const names = (list: readonly District[]) => list.map((d) => d.name);

// The boxes of cities that are not open yet are placeholders until their data lands.
export const CITIES: City[] = [
  {
    id: 'izmir',
    name: 'İzmir',
    locative: "İzmir'de",
    examples: {
      a: 'Alsancak',
      aLoc: "Alsancak'ta",
      b: 'Konak',
      bLoc: "Konak'ta",
      c: 'Bornova',
      cLoc: "Bornova'da",
      d: 'Karşıyaka',
      dLoc: "Karşıyaka'da",
    },
    available: true,
    center: IZMIR_CENTER,
    bounds: { minLat: 37.8, maxLat: 39.4, minLng: 26.2, maxLng: 28.5 },
    radiusKm: 120,
    // Keeps out the open Aegean (and Chios / Lesbos) while Çeşme, Alaçatı, Karaburun, Foça, Dikili stay in.
    westLimits: [
      [38.75, 26.7], // Foça, Dikili, Bergama
      [38.5, 26.33], // Karaburun
      [38.36, 26.45], // sea between Karaburun and Çeşme
      [38.2, 26.2], // Çeşme peninsula
      [0, 26.6], // Seferihisar, Özdere and south
    ],
    districts: names(IZMIR_DISTRICTS),
    districtCenters: IZMIR_DISTRICTS,
    parkingSource: 'izmir-open-data',
    parkingAttribution: 'İzmir Büyükşehir Belediyesi Açık Veri',
  },
  {
    id: 'istanbul',
    name: 'İstanbul',
    locative: "İstanbul'da",
    examples: {
      a: 'Kadıköy',
      aLoc: "Kadıköy'de",
      b: 'Beşiktaş',
      bLoc: "Beşiktaş'ta",
      c: 'Taksim',
      cLoc: "Taksim'de",
      d: 'Üsküdar',
      dLoc: "Üsküdar'da",
    },
    available: true,
    center: { lat: 41.0082, lng: 28.9784 },
    bounds: { minLat: 40.8, maxLat: 41.6, minLng: 27.95, maxLng: 29.95 },
    radiusKm: 100,
    districts: names(ISTANBUL_DISTRICTS),
    districtCenters: ISTANBUL_DISTRICTS,
    parkingSource: 'ispark',
    parkingAttribution: 'İBB Açık Veri / İSPARK',
  },
  {
    id: 'ankara',
    name: 'Ankara',
    locative: "Ankara'da",
    examples: {
      a: 'Kızılay',
      aLoc: "Kızılay'da",
      b: 'Çankaya',
      bLoc: "Çankaya'da",
      c: 'Tunalı',
      cLoc: "Tunalı'da",
      d: 'Bahçelievler',
      dLoc: "Bahçelievler'de",
    },
    available: true,
    center: { lat: 39.9208, lng: 32.8541 },
    // The province reaches about 38.6-40.75 N, 30.8-34.3 E; its far points lie ~160 km from the centre.
    bounds: { minLat: 38.6, maxLat: 40.75, minLng: 30.8, maxLng: 34.3 },
    radiusKm: 170,
    districts: names(ANKARA_DISTRICTS),
    districtCenters: ANKARA_DISTRICTS,
    // No live parking API: the OSM car parks carry a capacity but never a free count.
    parkingSource: 'osm',
    parkingAttribution: 'OpenStreetMap',
  },
  {
    id: 'antalya',
    name: 'Antalya',
    locative: "Antalya'da",
    available: false,
    center: { lat: 36.8969, lng: 30.7133 },
    bounds: { minLat: 36.2, maxLat: 37.4, minLng: 29.9, maxLng: 31.6 },
    radiusKm: 100,
    districts: [],
    districtCenters: [],
    parkingSource: null,
    parkingAttribution: null,
  },
  {
    id: 'bursa',
    name: 'Bursa',
    locative: "Bursa'da",
    available: false,
    center: { lat: 40.1885, lng: 29.061 },
    bounds: { minLat: 39.7, maxLat: 40.6, minLng: 28.3, maxLng: 29.8 },
    radiusKm: 80,
    districts: [],
    districtCenters: [],
    parkingSource: null,
    parkingAttribution: null,
  },
];

/** Parking sources without occupancy: a city whose source is one of them has no live parking API. */
const STATIC_PARKING_SOURCES: readonly (DataSource | null)[] = ['osm', 'izelman', 'apple'];

/** False for a city whose car parks are bundled records only (Ankara): no free counts will ever arrive. */
export const hasLiveParking = (city: City = activeCity()): boolean =>
  !STATIC_PARKING_SOURCES.includes(city.parkingSource);

/** True only for a known city that is open for use. */
export const isAvailableCity = (id: unknown): id is string =>
  typeof id === 'string' && CITIES.some((c) => c.id === id && c.available);

export const cityById = (id: string): City =>
  CITIES.find((c) => c.id === id) ?? CITIES.find((c) => c.id === DEFAULT_CITY)!;

// Module state, not the store: the store imports this file, so reading it here would be a cycle.
let active = DEFAULT_CITY;

/** Called by the store when the selected city changes; unavailable ids are ignored. */
export function setActiveCity(id: string): void {
  if (isAvailableCity(id)) active = id;
}

/** The selected city. Data modules read it at use time, never at import time. */
export const activeCity = (): City => cityById(active);

/** The example places of a city (default: the active one), as interpolation values for `t(key, cityExamples())`. */
export const cityExamples = (city: City = activeCity()): CityExamples =>
  city.examples ?? cityById(DEFAULT_CITY).examples!;

/**
 * Rough province outline of a city: inside its box, within `radiusKm` of its
 * centre and (where set) east of the west coast. A location outside is not a
 * useful search centre.
 */
export function isInCityArea(p: LatLng, city: City = activeCity()): boolean {
  const b = city.bounds;
  if (!(
    p.lat >= b.minLat &&
    p.lat <= b.maxLat &&
    p.lng >= b.minLng &&
    p.lng <= b.maxLng &&
    distanceMeters(p, city.center) < city.radiusKm * 1000
  ))
    return false;
  if (!city.westLimits) return true;
  const band = city.westLimits.find(([minLat]) => p.lat >= minLat);
  return !!band && p.lng >= band[1];
}

/** The open city whose area holds `p`, if any (cities do not overlap). */
export const cityAt = (p: LatLng): City | undefined =>
  CITIES.find((c) => c.available && isInCityArea(p, c));
