import type { Parking } from '@/data/types';

import type { Restaurant } from '@/data/restaurants';

import { wrongDataIssueUrl, wrongRestaurantIssueUrl } from '../report';

const parking = { id: 'izmir-7', name: 'Kordon & Alsancak', source: 'izmir-open-data' } as Parking;

describe('wrongDataIssueUrl', () => {
  it('prefills the veri-yanlis issue form by field id', () => {
    const url = new URL(wrongDataIssueUrl(parking));
    expect(url.pathname).toBe('/patrickgt966-art/yerim-var-/issues/new');
    expect(url.searchParams.get('template')).toBe('veri-yanlis.yml');
    expect(url.searchParams.get('title')).toBe('Veri yanlış: Kordon & Alsancak');
    expect(url.searchParams.get('otopark')).toBe(
      'Kordon & Alsancak (izmir-7) · veri kaynağı: izmir-open-data',
    );
    expect(url.searchParams.has('body')).toBe(false);
  });
});

describe('wrongRestaurantIssueUrl', () => {
  it('prefills the restoran-yanlis form with the name, id, source and point', () => {
    const r = {
      id: 'ov-abc',
      name: 'Köfteci & Ocakbaşı',
      source: 'overture',
      lat: 38.4371234,
      lng: 27.1429876,
    } as Restaurant;
    const url = new URL(wrongRestaurantIssueUrl(r));
    expect(url.pathname).toBe('/patrickgt966-art/yerim-var-/issues/new');
    expect(url.searchParams.get('template')).toBe('restoran-yanlis.yml');
    expect(url.searchParams.get('title')).toBe('Restoran bilgisi yanlış: Köfteci & Ocakbaşı');
    expect(url.searchParams.get('restoran')).toBe(
      'Köfteci & Ocakbaşı (ov-abc) · veri kaynağı: overture · 38.43712,27.14299',
    );
  });
});
