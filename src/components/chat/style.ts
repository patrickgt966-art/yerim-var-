import { brand } from '@/theme';

/** Soft navy drop shadow shared by bubbles, cards and bars. */
export const softShadow = (opacity = 0.06, y = 2, radius = 8) =>
  ({
    shadowColor: brand.navy,
    shadowOpacity: opacity,
    shadowRadius: radius,
    shadowOffset: { width: 0, height: y },
    elevation: 1,
  }) as const;

/** Left inset that lines carousels and chip rows up with the bot bubbles (16 + avatar 30 + gap 8). */
export const BOT_INSET = 54;
