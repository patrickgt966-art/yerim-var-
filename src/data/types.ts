export type OccupancyKind = 'live' | 'estimated';
export type PriceKind = 'official' | 'estimated';
/**
 * Static records bundled with the app, without occupancy:
 * 'izelman' (municipal inventory, 2022) and 'osm' (OpenStreetMap).
 */
export type DataSource = 'izmir-open-data' | 'mock' | 'izelman' | 'osm';
export type StaticSource = 'izelman' | 'osm';

export type OpeningHours = Partial<
  Record<'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday', string>
>;

export type Parking = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** null when the source does not provide enough data to derive it. */
  capacity: number | null;
  /** null when unknown. Never shown without a freshness label. */
  free: number | null;
  isIndoor: boolean | null;
  isOpen: boolean | null;
  isPaid: boolean | null;
  nonstop: boolean | null;
  openingHours: OpeningHours | null;
  address: string | null;
  /** Free-text opening hours when the source has no per-day table (OSM syntax). */
  openingHoursText?: string | null;
  operator?: string | null;
  /** True when the name was generated ("Otopark · Bostanlı yakını"), not from the source. */
  genericName?: boolean;
  /** 'customers': open to visitors of a shop/mall; 'subscribers': monthly pass holders. */
  access?: 'customers' | 'subscribers' | null;
  source: DataSource;
  /** Measurement time reported by the source (ISO). The İzmir API has none. */
  updatedAt: string | null;
  /** When this app downloaded the record (ISO). */
  fetchedAt: string;
  occupancyKind: OccupancyKind;
};

export type ParkingResult = {
  parkings: Parking[];
  source: DataSource;
  fetchedAt: string;
  /** Set when the primary provider failed (we show cached or sample data). */
  fallbackReason?: string;
  /** True when this is the last good result from the device cache, not a fresh download. */
  offline?: boolean;
};

export interface ParkingProvider {
  readonly source: DataSource;
  list(signal?: AbortSignal): Promise<Parking[]>;
}
