/** Brand palette. Values come from design/*.html. */
export const brand = {
  navy: '#0B3C49',
  orange: '#FF8A1F',
  /** Darker orange for orange-on-white graphics (5.2:1 on white). */
  orangeStrong: '#C2410C',
  orangeLight: '#FFB27A',
  yellow: '#FFE08A',
  cream: '#FFF1E3',
  surface: '#F4F7F8',
  line: '#B5C3C8',
  textSecondary: '#4F6A75',
  white: '#FFFFFF',
} as const;

export const occupancy = {
  plenty: '#0E7C6B',
  few: '#B45309',
  full: '#B91C1C',
} as const;

export type Palette = {
  bg: string;
  surface: string;
  card: string;
  text: string;
  textSecondary: string;
  line: string;
  dashed: string;
  slotFilled: string;
  primary: string;
  onPrimary: string;
  accent: string;
  /** Accent for icons/lines on the card background (>= 4.5:1). */
  accentStrong: string;
  chipBg: string;
  hero: string;
  onHero: string;
  plenty: string;
  few: string;
  full: string;
  badgeNearBg: string;
  badgeNearText: string;
  badgeFreshBg: string;
  badgeFreshText: string;
  badgeUnknownBg: string;
  badgeUnknownText: string;
  /** Friendly "no live count" badge: informative, not an error. */
  badgeInfoBg: string;
  badgeInfoText: string;
  warnBg: string;
  warnText: string;
};

export const lightPalette: Palette = {
  bg: brand.white,
  surface: brand.surface,
  card: brand.white,
  text: brand.navy,
  textSecondary: brand.textSecondary,
  line: brand.line,
  dashed: '#7F98A1',
  slotFilled: '#C9D6DA',
  primary: brand.navy,
  onPrimary: brand.white,
  accent: brand.orange,
  accentStrong: brand.orangeStrong,
  chipBg: '#E6EEF0',
  hero: brand.navy,
  onHero: brand.white,
  plenty: occupancy.plenty,
  few: occupancy.few,
  full: occupancy.full,
  badgeNearBg: '#FFEBD6',
  badgeNearText: '#92400E',
  badgeFreshBg: '#D9F5EE',
  badgeFreshText: '#0B5E50',
  badgeUnknownBg: '#E6EEF0',
  badgeUnknownText: '#3F5964',
  badgeInfoBg: '#FFF3C4',
  badgeInfoText: brand.navy,
  warnBg: brand.cream,
  warnText: '#92400E',
};

/** Dark palette: navy becomes the canvas, orange stays the accent. */
export const darkPalette: Palette = {
  bg: '#061F26',
  surface: '#0B2C35',
  card: '#0F3540',
  text: '#F4F7F8',
  textSecondary: '#A9BEC5',
  line: '#24505C',
  dashed: '#6F8C95',
  slotFilled: '#36606B',
  primary: brand.orange,
  onPrimary: '#061F26',
  accent: brand.orange,
  accentStrong: brand.orange,
  chipBg: '#16424E',
  hero: '#082D37',
  onHero: brand.white,
  plenty: '#3CC3A9',
  few: '#F5A04A',
  full: '#F27474',
  badgeNearBg: '#4A2A0C',
  badgeNearText: '#FFC48F',
  badgeFreshBg: '#0E4A40',
  badgeFreshText: '#9BE7D7',
  badgeUnknownBg: '#16424E',
  badgeUnknownText: '#C9D6DA',
  badgeInfoBg: '#3D3517',
  badgeInfoText: brand.yellow,
  warnBg: '#4A2A0C',
  warnText: '#FFC48F',
};

export const fonts = {
  display: 'BricolageGrotesque_800ExtraBold',
  displayBold: 'BricolageGrotesque_700Bold',
  body: 'PlusJakartaSans_500Medium',
  bodyBold: 'PlusJakartaSans_700Bold',
  bodyExtraBold: 'PlusJakartaSans_800ExtraBold',
} as const;

/** Signature asymmetric corner: three round corners, bottom-left tight. */
export function asym(r: number, tight = Math.max(2, Math.round(r * 0.27))) {
  return {
    borderTopLeftRadius: r,
    borderTopRightRadius: r,
    borderBottomRightRadius: r,
    borderBottomLeftRadius: tight,
  };
}

/** Minimum touch target (HIG). */
export const HIT = 44;
