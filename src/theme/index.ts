import { useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppearance } from '@/store/appearance';

import {
  darkPalette,
  lightPalette,
  TAB_BAR_GAP,
  TAB_BAR_HEIGHT,
  TAB_BAR_OVERHANG,
  type Palette,
} from './tokens';

export * from './status';
export * from './tokens';

/**
 * The palette for the look the user picked in Profil (Açık / Koyu / Telefonun ayarı). Light is the
 * warm paper page with navy ink and the orange accent; dark makes navy the canvas and keeps orange.
 */
export function useColors(): Palette {
  return useIsDark() ? darkPalette : lightPalette;
}

/** True when the dark look is on: picked in Profil, or 'auto' with the phone in dark mode. */
export function useIsDark(): boolean {
  const pref = useAppearance((s) => s.theme);
  const system = useColorScheme();
  return pref === 'dark' || (pref === 'auto' && system === 'dark');
}

/**
 * Bottom space a tab screen needs so its content clears the floating tab bar
 * (bar, raised button, gap, safe area) plus a small breathing gap.
 */
export function useTabBarSpace(extra = 16): number {
  const { bottom } = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + TAB_BAR_OVERHANG + TAB_BAR_GAP + bottom + extra;
}
