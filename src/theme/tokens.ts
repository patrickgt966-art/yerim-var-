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
  /** Live line on a navy surface (home "Yakınımda otopark"). */
  mint: '#9FE3D2',
  /** Small text on the orange surface. */
  brown: '#5A2A00',
  /** Warm page background (design V5). */
  paper: '#FBF7F1',
  /** Soft green surface: car parks (home "Otopark bul", the active park). */
  mintSoft: '#E2F1EA',
  /** Text on mintSoft (5.5:1). */
  mintText: '#0E6B5A',
  /** Soft peach surface: food (home "Yemek bul", craving chips). */
  peachSoft: '#FCE8D5',
  /** Border of a peach chip. */
  peachLine: '#F2D6BC',
  /** Text on peachSoft (6:1). */
  peachText: '#8A4513',
} as const;

/**
 * Occupancy status colours (design V5.1 "tek renk dili"): the same four everywhere a car park
 * shows how full it is. Each `fg` is >= 4.5:1 on its `bg`, on white and on paper; see statusTone.
 */
export const occupancy = {
  /** Bol yer: 5.5:1 on mintSoft, 6.4:1 on white. */
  plenty: brand.mintText,
  plentyBg: brand.mintSoft,
  /** Az kaldı: 4.9:1 on peachSoft, 5.9:1 on white (#B45309 was 4.2:1 on peachSoft). */
  few: '#A54A07',
  fewBg: brand.peachSoft,
  /** Dolu: 5.3:1 on its pink, 6.5:1 on white. */
  full: '#B91C1C',
  fullBg: '#FBE3E1',
  /** Bilgi yok / no live count: 6.1:1 on its sand, 7.4:1 on white. */
  unknown: '#3F5964',
  unknownBg: '#EFE8DD',
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
  /** Soft green surface (car parks) and its text. */
  mintSoft: string;
  mintText: string;
  /** Soft peach surface (food), its edge and its text. */
  peachSoft: string;
  peachLine: string;
  peachText: string;
  /** Text and icons in the brand's ink: navy on light, near-white on dark. */
  ink: string;
  /** Status bar text over the page. */
  statusBar: 'dark' | 'light';
};

export const lightPalette: Palette = {
  bg: brand.paper,
  surface: '#F4EEE5',
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
  chipBg: '#EFE8DD',
  hero: brand.navy,
  onHero: brand.white,
  plenty: occupancy.plenty,
  few: occupancy.few,
  full: occupancy.full,
  badgeNearBg: '#FFEBD6',
  badgeNearText: '#92400E',
  badgeFreshBg: brand.mintSoft,
  badgeFreshText: '#0B5E50',
  badgeUnknownBg: '#EFE8DD',
  badgeUnknownText: '#3F5964',
  badgeInfoBg: '#FFF3C4',
  badgeInfoText: brand.navy,
  warnBg: brand.cream,
  warnText: '#92400E',
  mintSoft: brand.mintSoft,
  mintText: brand.mintText,
  peachSoft: brand.peachSoft,
  peachLine: brand.peachLine,
  peachText: brand.peachText,
  ink: brand.navy,
  statusBar: 'dark',
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
  mintSoft: '#0E3B36',
  mintText: '#8FE0CC',
  peachSoft: '#3A2416',
  peachLine: '#5A3A24',
  peachText: '#FFC48F',
  ink: '#F4F7F8',
  statusBar: 'light',
};

export const fonts = {
  display: 'BricolageGrotesque_800ExtraBold',
  displayBold: 'BricolageGrotesque_700Bold',
  body: 'PlusJakartaSans_500Medium',
  bodyBold: 'PlusJakartaSans_700Bold',
  bodyExtraBold: 'PlusJakartaSans_800ExtraBold',
  /** Hand-written notes and greetings (Caveat), used sparingly. */
  hand: 'Caveat_700Bold',
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

/** Floating tab bar: bar height, how far the raised "Yerim" button rises above it, gap below. */
export const TAB_BAR_HEIGHT = 76;
// Room for the raised Yerim button above the bar, high enough to leave its "Yerim" label free
// under it, in line with the other tabs' labels.
export const TAB_BAR_OVERHANG = 24;
export const TAB_BAR_GAP = 8;
/** The raised Yerim button in the middle of the tab bar. */
export const TAB_CENTER_SIZE = 66;
