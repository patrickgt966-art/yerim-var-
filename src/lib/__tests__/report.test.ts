import type { Parking } from '@/data/types';

import { wrongDataIssueUrl } from '../report';

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
