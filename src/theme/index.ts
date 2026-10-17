import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  lightPalette,
  TAB_BAR_GAP,
  TAB_BAR_HEIGHT,
  TAB_BAR_OVERHANG,
  type Palette,
} from './tokens';

export * from './tokens';

/**
 * Brand decision (2026-10-09, warm since V5 2026-10-17): warm paper background, navy as the second colour,
 * orange accent, in every system appearance. `darkPalette` stays in tokens
 * in case a dark theme comes back.
 */
export function useColors(): Palette {
  return lightPalette;
}

/**
 * Bottom space a tab screen needs so its content clears the floating tab bar
 * (bar, raised button, gap, safe area) plus a small breathing gap.
 */
export function useTabBarSpace(extra = 16): number {
  const { bottom } = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + TAB_BAR_OVERHANG + TAB_BAR_GAP + bottom + extra;
}
