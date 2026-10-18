import { occupancyLevel } from '@/data/freshness';

import { statusTone } from '../status';
import { brand } from '../tokens';

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

describe('statusTone', () => {
  it('maps each occupancy level to its own colour pair', () => {
    expect(statusTone(occupancyLevel(40, 100))).toEqual({ fg: '#0E6B5A', bg: brand.mintSoft });
    expect(statusTone(occupancyLevel(3, 100)).bg).toBe(brand.peachSoft);
    expect(statusTone(occupancyLevel(0, 100))).toEqual({ fg: '#B91C1C', bg: '#FBE3E1' });
    expect(statusTone(occupancyLevel(null, 100))).toEqual({ fg: '#3F5964', bg: '#EFE8DD' });
  });

  it.each(['plenty', 'few', 'full', 'unknown'] as const)(
    '%s text is readable on its pill, on white and on paper (>= 4.5:1)',
    (level) => {
      const { fg, bg } = statusTone(level);
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(fg, brand.white)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(fg, brand.paper)).toBeGreaterThanOrEqual(4.5);
    },
  );
});
