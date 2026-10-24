import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook } from '@testing-library/react-native';
import * as RN from 'react-native';

import { useAppearance } from '@/store/appearance';

import { darkPalette, lightPalette, useColors, useIsDark } from '..';

const scheme = jest.spyOn(RN, 'useColorScheme');

/** WCAG 2 contrast ratio of two #RRGGBB colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, bl] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('the look (Profil > Görünüm)', () => {
  beforeEach(() => useAppearance.setState({ theme: 'auto' }));

  it('follows the phone on "auto"', async () => {
    scheme.mockReturnValue('dark');
    expect((await renderHook(() => useColors())).result.current).toBe(darkPalette);
    scheme.mockReturnValue('light');
    expect((await renderHook(() => useColors())).result.current).toBe(lightPalette);
  });

  it('a pick wins over the phone', async () => {
    scheme.mockReturnValue('dark');
    useAppearance.getState().setTheme('light');
    expect((await renderHook(() => useIsDark())).result.current).toBe(false);
    scheme.mockReturnValue('light');
    useAppearance.getState().setTheme('dark');
    expect((await renderHook(() => useColors())).result.current).toBe(darkPalette);
  });

  it('every palette has the same keys, and dark keeps the orange accent', () => {
    expect(Object.keys(darkPalette).sort()).toEqual(Object.keys(lightPalette).sort());
    expect(darkPalette.accent).toBe(lightPalette.accent);
    expect(darkPalette.statusBar).toBe('light');
  });

  it('keeps only a known choice from storage', async () => {
    await AsyncStorage.setItem(
      'yerim-var/appearance',
      JSON.stringify({ state: { theme: 'neon' }, version: 1 }),
    );
    await useAppearance.persist.rehydrate();
    expect(useAppearance.getState().theme).toBe('auto');
    await AsyncStorage.setItem(
      'yerim-var/appearance',
      JSON.stringify({ state: { theme: 'dark' }, version: 1 }),
    );
    await useAppearance.persist.rehydrate();
    expect(useAppearance.getState().theme).toBe('dark');
  });

  const d = darkPalette;
  const pairs: [string, string, string][] = [
    ['text on bg', d.text, d.bg],
    ['text on surface', d.text, d.surface],
    ['text on card', d.text, d.card],
    ['text on chip', d.text, d.chipBg],
    ['textSecondary on bg', d.textSecondary, d.bg],
    ['textSecondary on card', d.textSecondary, d.card],
    ['textSecondary on chip', d.textSecondary, d.chipBg],
    ['ink on card', d.ink, d.card],
    ['onHero on hero', d.onHero, d.hero],
    ['onPrimary on primary', d.onPrimary, d.primary],
    ['plenty on bg', d.plenty, d.bg],
    ['plenty on card', d.plenty, d.card],
    ['few on card', d.few, d.card],
    ['full on card', d.full, d.card],
    ['badgeUnknownText on its bg', d.badgeUnknownText, d.badgeUnknownBg],
    ['badgeFreshText on its bg', d.badgeFreshText, d.badgeFreshBg],
    ['badgeNearText on its bg', d.badgeNearText, d.badgeNearBg],
    ['badgeInfoText on its bg', d.badgeInfoText, d.badgeInfoBg],
    ['warnText on warnBg', d.warnText, d.warnBg],
    ['mintText on mintSoft', d.mintText, d.mintSoft],
    ['peachText on peachSoft', d.peachText, d.peachSoft],
    ['peachText on card', d.peachText, d.card],
    ['tab label (inactive) on the bar', '#D9CFC2', d.card],
    ['tab label (active) on its pill', '#FFFFFF', '#3A332C'],
  ];
  it.each(pairs)('dark: %s is >= 4.5:1', (_name, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});
