import { lightPalette, type Palette } from './tokens';

export * from './tokens';

/**
 * Brand decision (2026-10-09): white background, navy as the second colour,
 * orange accent, in every system appearance. `darkPalette` stays in tokens
 * in case a dark theme comes back.
 */
export function useColors(): Palette {
  return lightPalette;
}
