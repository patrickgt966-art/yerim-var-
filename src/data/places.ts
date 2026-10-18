import raw from '../../data/places.json';
import { activeCity, cityById, isInCityArea } from './cities';
import { CITY_CURATED_PLACES } from './curatedPlaces';
import { placesFile, railFile } from './cityData';
import { distanceMeters, type LatLng } from './geo';

export type Place = { id: string; name: string; district: string; icon: string } & LatLng;

/** İzmir's popular places and piers (data/places.json); other cities have none yet. */
export const POPULAR_PLACES = raw.popular as Place[];
export const PIERS = raw.piers as ({ name: string } & LatLng)[];

export { IZMIR_CENTER } from './cities';

/** Popular places of the active city. */
export const popularPlaces = (): Place[] => (activeCity().id === 'izmir' ? POPULAR_PLACES : []);

/** Piers of the active city. */
const piers = () => (activeCity().id === 'izmir' ? PIERS : []);

export function isNearPier(p: LatLng, maxMeters = 400): boolean {
  return piers().some((pier) => distanceMeters(p, pier) <= maxMeters);
}

// Keyed by city id: switching city must never serve another city's stations.
const railStations = new Map<string, LatLng[]>();

/** Within maxMeters of an İZBAN / metro / tram station (places with k 'rail'). */
export function isNearRail(p: LatLng, maxMeters = 500): boolean {
  const id = activeCity().id;
  let stations = railStations.get(id);
  if (!stations) {
    stations = [
      ...(railFile(id).items ?? []),
      ...(placesFile(id).items ?? []).filter((x) => x.k === 'rail'),
    ].map((x) => ({ lat: x.a, lng: x.o }));
    railStations.set(id, stations);
  }
  return stations.some((s) => distanceMeters(p, s) <= maxMeters);
}

/** İzmir province outline (see isInCityArea); the active city's is `isInCityArea(p)`. */
export function isInIzmirArea(p: LatLng): boolean {
  return isInCityArea(p, cityById('izmir'));
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

/** İzmir's curated places. */
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
  // Kıbrıs Şehitleri Caddesi, Alsancak: the shops numbered 90-140 sit at 38.4374-38.4410 N, 27.1426-27.1444 E.
  {
    name: 'Kıbrıs Şehitleri Caddesi',
    district: 'Alsancak',
    kind: 'area',
    lat: 38.4378,
    lng: 27.1435,
    aliases: [
      'kibris sehitleri',
      'kibris sehitleri cad',
      'kibris sehitleri cd',
      'alsancak kibris sehitleri',
      'alsancak kibris sehitleri caddesi',
    ],
  },
  // Gündoğdu Meydanı (Ali Çetinkaya Bulvarı); the "Gündoğdu -2" car park and the cafés on the square lie within 100 m.
  {
    name: 'Gündoğdu Meydanı',
    district: 'Alsancak',
    kind: 'area',
    lat: 38.435,
    lng: 27.1407,
    aliases: ['gundogdu'],
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

/** Curated places of the active city (İzmir's above, the others' in curatedPlaces.ts). */
export const curatedPlaces = (): CuratedPlace[] =>
  activeCity().id === 'izmir' ? CURATED_PLACES : (CITY_CURATED_PLACES[activeCity().id] ?? []);
