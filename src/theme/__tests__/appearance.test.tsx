import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook } from '@testing-library/react-native';
import * as RN from 'react-native';

import { useAppearance } from '@/store/appearance';

import { darkPalette, lightPalette, useColors, useIsDark } from '..';

const scheme = jest.spyOn(RN, 'useColorScheme');

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
});
