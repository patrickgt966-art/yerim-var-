import { restaurantsNear, type NearbyRestaurant } from '@/data/restaurants';
import type { Parking } from '@/data/types';
import { MEAL_CATS } from '@/lib/nudge';

import { NO_TICKET_FACTS, ticketFacts } from '../home/ticketFacts';

// Alsancak, İzmir; ~111 m per 0.001 degree of latitude.
const HERE = { lat: 38.4361, lng: 27.1425 };
const NOW = new Date(Date.UTC(2026, 9, 23, 16, 30)); // 19:30 in Turkey
const north = (m: number) => ({ lat: HERE.lat + m / 111_000, lng: HERE.lng });

function park(id: string, m: number, over: Partial<Parking> = {}): Parking {
  return {
    id,
    name: `Otopark ${id}`,
    ...north(m),
    capacity: 100,
    free: null,
    isIndoor: null,
    isOpen: null,
    isPaid: true,
    nonstop: null,
    openingHours: null,
    address: null,
    source: 'osm',
    updatedAt: null,
    fetchedAt: NOW.toISOString(),
    occupancyKind: 'estimated',
    ...over,
  };
}

function place(id: string, m: number, openingHours: string | null): NearbyRestaurant {
  return {
    id,
    name: `Yer ${id}`,
    ...north(m),
    kind: 'restaurant',
    cuisines: [],
    diets: [],
    openingHours,
    phone: null,
    website: null,
    instagram: null,
    address: null,
    outdoorSeating: null,
    wheelchair: null,
    reservation: null,
    source: 'osm',
    verified: true,
    distanceM: m,
  };
}

const base = { here: HERE, parkings: [], around: [], cityFood: 0, now: NOW };

describe('ticketFacts: car parks', () => {
  it('counts the open car parks within ten minutes on foot and names the nearest', () => {
    const f = ticketFacts({
      ...base,
      parkings: [
        park('near', 200),
        park('mid', 500),
        park('shut', 100, { isOpen: false, fetchedAt: NOW.toISOString() }),
        park('far', 1500),
      ],
      cityFood: 0,
    });
    // 10 min = 615 m in a straight line; the closed one is not counted and not named.
    expect(f.parkWithin).toBe(2);
    expect(f.nearestPark).toEqual({ name: 'Otopark near', walk: 3 });
    expect(f.cityParks).toBe(4);
  });

  it('names the nearest car park even when none is within ten minutes', () => {
    const f = ticketFacts({ ...base, parkings: [park('far', 1500)] });
    expect(f.parkWithin).toBeNull();
    expect(f.nearestPark).toEqual({ name: 'Otopark far', walk: 24 });
  });

  it('keeps only the city count when the nearest car park is out of reach or location is off', () => {
    const f = ticketFacts({ ...base, parkings: [park('away', 5000)] });
    expect(f).toMatchObject({ parkWithin: null, nearestPark: null, cityParks: 1 });
    const off = ticketFacts({ ...base, here: null, parkings: [park('a', 100)], cityFood: 42 });
    expect(off).toEqual({ ...NO_TICKET_FACTS, cityParks: 1, cityFood: 42 });
  });

  it('is empty, not zero, when there is nothing', () => {
    expect(ticketFacts({ ...base, parkings: undefined })).toEqual(NO_TICKET_FACTS);
  });
});

describe('ticketFacts: places', () => {
  it('counts the places open now and all within ten minutes, never the far ones', () => {
    const f = ticketFacts({
      ...base,
      around: [
        place('open1', 100, '24/7'),
        place('open2', 400, '24/7'),
        place('shut', 300, 'Mo-Su off'),
        place('unknown', 200, null),
        place('far', 900, '24/7'),
      ],
      cityFood: 900,
    });
    expect(f.foodWithin).toBe(4);
    // Only places known to be open count as open.
    expect(f.foodOpenNow).toBe(2);
    expect(f.cityFood).toBe(900);
  });

  it('has no open-now count when nothing is known to be open', () => {
    const f = ticketFacts({ ...base, around: [place('a', 100, null), place('b', 200, null)] });
    expect(f.foodOpenNow).toBeNull();
    expect(f.foodWithin).toBe(2);
  });

  it('finds the meal of the hour with a real count from the bundled places', () => {
    const around = restaurantsNear(HERE, 1000, 5000);
    const f = ticketFacts({ ...base, around });
    expect(f.mealNear).not.toBeNull();
    expect(MEAL_CATS.evening).toContain(f.mealNear!.cat);
    expect(f.mealNear!.count).toBeGreaterThanOrEqual(3);
    // At breakfast time the category is a breakfast one.
    const morning = ticketFacts({ ...base, around, now: new Date(Date.UTC(2026, 9, 23, 6, 0)) });
    if (morning.mealNear) expect(MEAL_CATS.morning).toContain(morning.mealNear.cat);
  });

  it('has no meal line without places or without a position', () => {
    expect(ticketFacts(base).mealNear).toBeNull();
    expect(
      ticketFacts({ ...base, here: null, around: restaurantsNear(HERE, 1000, 50) }).mealNear,
    ).toBeNull();
  });
});
