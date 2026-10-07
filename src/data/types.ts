export type OccupancyKind = 'live' | 'estimated';
export type PriceKind = 'official' | 'estimated';
export type DataSource = 'izmir-open-data' | 'mock';

export type OpeningHours = Partial<
  Record<
    'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday',
    string
  >
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
  /** Set when the primary provider failed and we fell back to sample data. */
  fallbackReason?: string;
};

export interface ParkingProvider {
  readonly source: DataSource;
  list(signal?: AbortSignal): Promise<Parking[]>;
}
