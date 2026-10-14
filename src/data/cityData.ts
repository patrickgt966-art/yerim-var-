import { activeCity } from './cities';
import type { FoodRecord } from './restaurants';
import type { StaticRecord } from './staticParkings';

/**
 * The bundled data files of each city. Every loader `require`s inside a
 * switch, so a city's JSON is only parsed once that city is in use. A city
 * without files (not open yet) gets an empty file. The İstanbul files are
 * placeholders until the data-refresh workflow fills them, so every field
 * except `items` is optional.
 */
export type PlaceRow = { n: string; a: number; o: number; k: string };
export type RailRow = { n?: string; a: number; o: number };
type Items<T> = { generatedAt?: string; release?: string; items?: T[] };
type StaticFile = { generatedAt?: string; parkings?: StaticRecord[] };

const EMPTY = { items: [] };

/** Search places (OpenStreetMap). */
export function placesFile(id: string = activeCity().id): Items<PlaceRow> {
  switch (id) {
    case 'izmir':
      return require('../../data/places-izmir.json');
    case 'istanbul':
      return require('../../data/places-istanbul.json');
    default:
      return EMPTY;
  }
}

/** Rail, metro and tram stations. */
export function railFile(id: string = activeCity().id): Items<RailRow> {
  switch (id) {
    case 'izmir':
      return require('../../data/rail-izmir.json');
    case 'istanbul':
      return require('../../data/rail-istanbul.json');
    default:
      return EMPTY;
  }
}

/** Restaurants from OpenStreetMap. */
export function foodFile(id: string = activeCity().id): Items<FoodRecord> {
  switch (id) {
    case 'izmir':
      return require('../../data/food-izmir.json');
    case 'istanbul':
      return require('../../data/food-istanbul.json');
    default:
      return EMPTY;
  }
}

/** Restaurants from Overture Maps that OpenStreetMap lacks. */
export function foodOvertureFile(id: string = activeCity().id): Items<FoodRecord> {
  switch (id) {
    case 'izmir':
      return require('../../data/food-overture-izmir.json');
    case 'istanbul':
      return require('../../data/food-overture-istanbul.json');
    default:
      return EMPTY;
  }
}

/** Car parks without occupancy. The İstanbul placeholder has `items`, not `parkings`. */
export function staticParkingsFile(id: string = activeCity().id): StaticFile {
  switch (id) {
    case 'izmir':
      return require('../../data/parkings-static.json');
    case 'istanbul':
      return require('../../data/parkings-static-istanbul.json');
    default:
      return {};
  }
}
