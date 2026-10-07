import { t } from 'i18next';

import raw from '../../data/places-izmir.json';
import { distanceMeters, type LatLng } from './geo';
import { POPULAR_PLACES } from './places';
import { staticParkings } from './staticParkings';

/** Kinds shown as a subtitle; the label text lives in i18n (search.kind.*). */
export type PlaceKind =
  | 'popular'
  | 'town'
  | 'area'
  | 'mall'
  | 'hospital'
  | 'university'
  | 'pier'
  | 'station'
  | 'hotel'
  | 'landmark'
  | 'parking';

export type SearchHit = { name: string; kind: PlaceKind } & LatLng;

type RawPlace = { n: string; a: number; o: number; k: Exclude<PlaceKind, 'popular' | 'parking'> };

/** Lower-case, Turkish letters folded to ASCII, punctuation dropped. */
export function fold(s: string): string {
  return s
    .toLocaleLowerCase('tr')
    .replace(/[ıİ]/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type Entry = SearchHit & { key: string; compact: string; rank: number };

// Higher wins on equal match quality.
const KIND_RANK: Record<PlaceKind, number> = {
  popular: 9,
  mall: 8,
  town: 7,
  area: 6,
  pier: 6,
  hospital: 5,
  university: 5,
  hotel: 4,
  landmark: 4,
  station: 4,
  parking: 3,
};

const SAME_PLACE_M = 300;

let index: Entry[] | null = null;

function entry(hit: SearchHit): Entry {
  const key = fold(hit.name);
  return { ...hit, key, compact: key.replace(/ /g, ''), rank: KIND_RANK[hit.kind] };
}

function buildIndex(): Entry[] {
  const places = (raw as { items: RawPlace[] }).items.map((p) =>
    entry({ name: p.n, lat: p.a, lng: p.o, kind: p.k }),
  );
  const popular = POPULAR_PLACES.map((p) =>
    entry({ name: p.name, lat: p.lat, lng: p.lng, kind: 'popular' }),
  );
  // Named car parks are useful targets too ("Konak Katlı").
  const parkings = staticParkings()
    .filter((p) => p.name !== t('parking.unnamed'))
    .map((p) => entry({ name: p.name, lat: p.lat, lng: p.lng, kind: 'parking' }));
  return [...popular, ...places, ...parkings];
}

/**
 * Searches bundled İzmir places (OpenStreetMap) and car park names on the
 * device. Matches ignore case, Turkish letters and spaces ("istinyepark",
 * "İstinye Park" and "istinye" all find "İstinyePark İzmir").
 */
export function searchPlaces(query: string, limit = 6): SearchHit[] {
  const q = fold(query);
  if (q.length < 2) return [];
  const qc = q.replace(/ /g, '');
  index ??= buildIndex();
  const scored: { e: Entry; score: number }[] = [];
  for (const e of index) {
    let score = 0;
    if (e.key === q || e.compact === qc) score = 400;
    else if (e.key.startsWith(q) || e.compact.startsWith(qc)) score = 300;
    else if (e.key.includes(` ${q}`)) score = 200;
    else if (e.compact.includes(qc)) score = 100;
    if (score > 0) scored.push({ e, score: score + e.rank * 5 - Math.min(e.key.length, 40) / 4 });
  }
  scored.sort((a, b) => b.score - a.score);
  const out: SearchHit[] = [];
  for (const { e } of scored) {
    // Same name in the same spot is one place; same name elsewhere is not
    // (e.g. "Ege Üniversitesi" campus vs. its metro station).
    if (out.some((o) => fold(o.name) === e.key && distanceMeters(o, e) <= SAME_PLACE_M)) continue;
    out.push({ name: e.name, kind: e.kind, lat: e.lat, lng: e.lng });
    if (out.length >= limit) break;
  }
  return out;
}

/** For tests: rebuild with the current data. */
export function resetSearchIndex() {
  index = null;
}
