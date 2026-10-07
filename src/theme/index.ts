import { useColorScheme } from 'react-native';

import { darkPalette, lightPalette, type Palette } from './tokens';

export * from './tokens';

export function useColors(): Palette {
  return useColorScheme() === 'dark' ? darkPalette : lightPalette;
}
