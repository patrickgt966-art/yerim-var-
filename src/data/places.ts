import raw from '../../data/places.json';
import { distanceMeters, type LatLng } from './geo';

export type Place = { id: string; name: string; district: string; icon: string } & LatLng;

export const POPULAR_PLACES = raw.popular as Place[];
export const PIERS = raw.piers as ({ name: string } & LatLng)[];

export const IZMIR_CENTER: LatLng = { lat: 38.4237, lng: 27.1428 };

export function isNearPier(p: LatLng, maxMeters = 400): boolean {
  return PIERS.some((pier) => distanceMeters(p, pier) <= maxMeters);
}

/**
 * Westmost longitude of İzmir land per latitude band: keeps out the open
 * Aegean (and Chios / Lesbos) while Çeşme, Alaçatı, Karaburun, Foça, Dikili
 * stay in. Bands are ordered from the highest lower bound down.
 */
const WEST_LIMITS: [minLat: number, minLng: number][] = [
  [38.75, 26.7], // Foça, Dikili, Bergama
  [38.5, 26.33], // Karaburun
  [38.36, 26.45], // sea between Karaburun and Çeşme
  [38.2, 26.2], // Çeşme peninsula
  [0, 26.6], // Seferihisar, Özdere and south
];

/**
 * Rough İzmir province outline: a box, within 120 km of the centre, and east
 * of the west coast; a location outside is not a useful search centre.
 */
export function isInIzmirArea(p: LatLng): boolean {
  if (!(
    p.lat >= 37.8 &&
    p.lat <= 39.4 &&
    p.lng <= 28.5 &&
    distanceMeters(p, IZMIR_CENTER) < 120_000
  ))
    return false;
  const band = WEST_LIMITS.find(([minLat]) => p.lat >= minLat);
  return !!band && p.lng >= band[1];
}

/**
 * Hand-picked places the OSM list lacks or names differently. Coordinates come
 * from nearby OSM / İzelman records (±300 m). `aliases` are folded search words
 * that count as an exact match for the place.
 */
export type CuratedPlace = {
  name: string;
  district: string;
  kind: 'landmark' | 'area' | 'pier' | 'station';
  aliases?: string[];
} & LatLng;

export const CURATED_PLACES: CuratedPlace[] = [
  // Starbucks "Folkart A Blok" node.
  {
    name: 'Folkart Towers',
    district: 'Bayraklı',
    kind: 'landmark',
    lat: 38.4546,
    lng: 27.1769,
    aliases: ['folkart', 'folkart kuleleri'],
  },
  // Folkart Towers stand at Manas Bulvarı No:39.
  {
    name: 'Manas Bulvarı',
    district: 'Bayraklı',
    kind: 'area',
    lat: 38.4546,
    lng: 27.1769,
    aliases: ['manas'],
  },
  // Next to the Ahmed Adnan Saygun Sanat Merkezi car park.
  {
    name: 'Ahmed Adnan Saygun Sanat Merkezi',
    district: 'Güzelyalı',
    kind: 'landmark',
    lat: 38.3974,
    lng: 27.0783,
    aliases: ['aassm', 'saygun sanat merkezi'],
  },
  // Kültürpark centre; the Atatürk Kültür Merkezi (AKM) lies inside the park.
  {
    name: 'Kültürpark',
    district: 'Alsancak',
    kind: 'landmark',
    lat: 38.4279,
    lng: 27.1455,
    aliases: ['fuar', 'izmir fuari', 'izmir fuar', 'fuar izmir', 'akm', 'ataturk kultur merkezi'],
  },
  // Beside the "Liman -1" street car park on Liman Caddesi.
  {
    name: 'Alsancak Limanı',
    district: 'Alsancak',
    kind: 'pier',
    lat: 38.4408,
    lng: 27.1424,
    aliases: [
      'kruvaziyer',
      'kruvaziyer terminali',
      'alsancak kruvaziyer terminali',
      'cruise terminal',
    ],
  },
  // OSM "İzmir Şehirlerarası Otobüs Terminali".
  {
    name: 'İzmir Otogarı',
    district: 'Bornova',
    kind: 'station',
    lat: 38.4309,
    lng: 27.2141,
    aliases: ['otogar', 'izmir otogari', 'izmir otogar', 'otobus terminali'],
  },
  // Hisarönü Şambalıcısı record, Kemeraltı.
  {
    name: 'Hisarönü',
    district: 'Konak',
    kind: 'area',
    lat: 38.4218,
    lng: 27.1331,
    aliases: ['hisaronu kemeralti'],
  },
  // Ephesus ruins (main gate area), Selçuk.
  {
    name: 'Efes Antik Kenti',
    district: 'Selçuk',
    kind: 'landmark',
    lat: 37.9396,
    lng: 27.3417,
    aliases: ['efes', 'ephesus', 'efes antik kent', 'efes antik'],
  },
];
