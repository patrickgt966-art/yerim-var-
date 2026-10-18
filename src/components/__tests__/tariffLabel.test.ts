import '@/i18n';
import i18n from 'i18next';

import { tariffBandLabel, tariffSourceLabel } from '../tariffLabel';

/* eslint-disable import/no-named-as-default-member */
const en = i18n.getFixedT('en') as unknown as (k: string, o?: Record<string, unknown>) => string;
const tr = i18n.getFixedT('tr') as unknown as (k: string, o?: Record<string, unknown>) => string;

const BANDS: Record<string, string> = {
  '0-1 Saat': '0–1 h',
  '8-12 Saat': '8–12 h',
  '25 Dk-1 Saat': '25 min–1 h',
  'Tam Gün': 'Full day',
  'Tam Gün Kamyon': 'Full day · Truck',
  '0-3 Saat Minibüs-Kamyonet': '0–3 h · Minibus, van',
  '12-13 Saat Otobüs': '12–13 h · Bus',
  '0-3 Saat Tır': '0–3 h · Lorry',
  'Kamyonet/Jeep/Minibüs': 'Minibus, van',
  Günlük: 'Daily',
  Vale: 'Valet',
  Etkinlik: 'Event',
  '0-1 saat': '0–1 h',
};

describe('tariff band labels', () => {
  it.each(Object.entries(BANDS))('%s reads %s in English', (label, want) => {
    expect(tariffBandLabel(label, en)).toBe(want);
  });

  it('every band label in the bundled tariffs reads without Turkish words in English', () => {
    const files = [
      require('../../../data/tariffs-ispark.json'),
      require('../../../data/tariffs.json'),
    ] as { tariffs: { bands: { label: string }[] }[] }[];
    const labels = new Set(
      files.flatMap((f) => f.tariffs.flatMap((x) => x.bands.map((b) => b.label))),
    );
    const turkish = [...labels]
      .map((l) => tariffBandLabel(l, en))
      .filter((l) => /saat|gün|\bdk\b|kamyon|otob|tır|\bvale\b/i.test(l));
    expect(turkish).toEqual([]);
  });

  it('keeps Turkish labels Turkish and an unknown label as it is', () => {
    expect(tariffBandLabel('Tam Gün', tr)).toBe('Tam gün');
    expect(tariffBandLabel('Gece tarifesi', en)).toBe('Gece tarifesi');
  });

  it('names the sample tariffs in the app language', () => {
    expect(tariffSourceLabel('Örnek değer (mock)', en)).toBe('Sample data (not real)');
    expect(tariffSourceLabel('İBB İSPARK', en)).toBe('İBB İSPARK');
  });
});
