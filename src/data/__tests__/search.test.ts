import '@/i18n';

import { fold, searchPlaces } from '../search';

describe('fold', () => {
  it('ignores case and Turkish letters', () => {
    expect(fold('İstinyePark İZMİR')).toBe('istinyepark izmir');
    expect(fold('Çiğli Şirinyer Göztepe Üçkuyular')).toBe('cigli sirinyer goztepe uckuyular');
    expect(fold('  Kemeraltı / Konak ')).toBe('kemeralti konak');
  });
});

describe('searchPlaces', () => {
  it('needs at least two letters', () => {
    expect(searchPlaces('k')).toEqual([]);
  });

  it('finds popular places without Turkish letters', () => {
    expect(searchPlaces('saat kulesi')[0]?.name).toBe('Saat Kulesi');
    expect(searchPlaces('kemeralti')[0]?.name).toBe('Kemeraltı');
  });

  it('finds named car parks by a partial name', () => {
    const hits = searchPlaces('konak katli');
    expect(hits.some((h) => h.name === 'Konak Katlı Otoparkı' && h.kind === 'parking')).toBe(true);
  });

  it('ignores spaces inside names', () => {
    expect(searchPlaces('saatkulesi')[0]?.name).toBe('Saat Kulesi');
  });

  it('never returns unnamed car parks', () => {
    expect(searchPlaces('otopark').every((h) => h.name !== 'Otopark')).toBe(true);
  });
});
