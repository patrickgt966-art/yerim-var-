import type { Parking, ParkingProvider } from './types';

type Seed = Omit<Parking, 'source' | 'updatedAt' | 'fetchedAt' | 'occupancyKind'>;

/**
 * Sample data for development and offline fallback. Names and numbers are
 * illustrative, not real. The UI labels them "Örnek veri".
 */
export const MOCK_SEEDS: Seed[] = [
  {
    id: 'mock-alsancak-katli',
    name: 'Alsancak Katlı Otopark',
    lat: 38.4381,
    lng: 27.1452,
    capacity: 60,
    free: 14,
    isIndoor: true,
    isOpen: true,
    isPaid: true,
    nonstop: true,
    openingHours: null,
    address: 'Alsancak, Konak',
  },
  {
    id: 'mock-kordon-acik',
    name: 'Kordon Açık Otopark',
    lat: 38.4396,
    lng: 27.1408,
    capacity: 40,
    free: 6,
    isIndoor: false,
    isOpen: true,
    isPaid: true,
    nonstop: false,
    openingHours: { monday: '07:00 – 23:00', tuesday: '07:00 – 23:00', wednesday: '07:00 – 23:00', thursday: '07:00 – 23:00', friday: '07:00 – 23:00', saturday: '08:00 – 23:00', sunday: '08:00 – 22:00' },
    address: 'Kordon, Alsancak',
  },
  {
    id: 'mock-gar-yani',
    name: 'Gar Yanı Otopark',
    lat: 38.4347,
    lng: 27.1478,
    capacity: 80,
    free: 3,
    isIndoor: false,
    isOpen: true,
    isPaid: true,
    nonstop: false,
    openingHours: null,
    address: 'Alsancak Garı yakını',
  },
  {
    id: 'mock-kibris-sehitleri',
    name: 'Kıbrıs Şehitleri Otoparkı',
    lat: 38.4362,
    lng: 27.1437,
    capacity: 35,
    free: 0,
    isIndoor: false,
    isOpen: true,
    isPaid: true,
    nonstop: false,
    openingHours: null,
    address: 'Alsancak',
  },
  {
    id: 'mock-konak-meydan',
    name: 'Konak Meydan Otoparkı',
    lat: 38.4176,
    lng: 27.1295,
    capacity: 120,
    free: 31,
    isIndoor: true,
    isOpen: true,
    isPaid: true,
    nonstop: true,
    openingHours: null,
    address: 'Konak',
  },
  {
    id: 'mock-kemeralti',
    name: 'Kemeraltı Girişi Otopark',
    lat: 38.4199,
    lng: 27.1338,
    capacity: 50,
    free: 4,
    isIndoor: false,
    isOpen: true,
    isPaid: true,
    nonstop: false,
    openingHours: null,
    address: 'Kemeraltı, Konak',
  },
  {
    id: 'mock-karsiyaka-iskele',
    name: 'Karşıyaka İskele Otoparkı',
    lat: 38.4561,
    lng: 27.1172,
    capacity: 70,
    free: 22,
    isIndoor: false,
    isOpen: true,
    isPaid: true,
    nonstop: false,
    openingHours: null,
    address: 'Karşıyaka',
  },
  {
    id: 'mock-bostanli',
    name: 'Bostanlı Sahil Otoparkı',
    lat: 38.4586,
    lng: 27.0956,
    capacity: 90,
    free: 9,
    isIndoor: false,
    isOpen: true,
    isPaid: false,
    nonstop: true,
    openingHours: null,
    address: 'Bostanlı, Karşıyaka',
  },
];

export class MockProvider implements ParkingProvider {
  readonly source = 'mock' as const;

  async list(): Promise<Parking[]> {
    const fetchedAt = new Date().toISOString();
    return MOCK_SEEDS.map((s) => ({
      ...s,
      source: 'mock',
      updatedAt: null,
      fetchedAt,
      occupancyKind: 'estimated',
    }));
  }
}
