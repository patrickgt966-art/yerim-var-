import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { brand, fonts } from '@/theme';

type Props = {
  /** Font size of both words. */
  size: number;
  /** `inline`: "Yerim Var" on one line. `stacked`: "Yerim" over "Var", centred (as assets/icon.png). */
  layout: 'inline' | 'stacked';
  /** `onDark`: "Yerim" white. `onLight`: "Yerim" navy. "Var" and the dot are always orange. */
  tone: 'onDark' | 'onLight';
  /** Expose it as a heading to screen readers. */
  header?: boolean;
};

// Plus Jakarta Sans 800 metrics (hhea, 1000 units per em): ascent 1.038, descent 0.222.
// A line height equal to ascent + descent leaves no extra leading, so the baseline sits at
// ASCENT * size from the top of the line on iOS and Android alike. The dot is placed from that.
const ASCENT = 1.038;
const LINE = 1.26;
// From the logo: the dot is 0.175 em wide, its centre 0.73 em above the baseline.
const DOT = 0.175;
const DOT_TOP = ASCENT - 0.73 - DOT / 2;

/**
 * The real logo as text: "Yerim" (the dot of the ı is an orange circle over a dotless ı)
 * and "Var" in orange. Only the ı is a separate piece, so the kerning of "Yer" is kept
 * and the dot stays centred on the stem. Font scaling is off: it is a logo, and the dot
 * position depends on the size.
 */
export function BrandWordmark({ size, layout, tone, header }: Props) {
  const { t } = useTranslation();
  const yerim = tone === 'onDark' ? brand.white : brand.navy;
  const word = {
    fontFamily: fonts.bodyExtraBold,
    fontSize: size,
    lineHeight: size * LINE,
    letterSpacing: -size * 0.02,
    includeFontPadding: false,
  } as const;
  const dot = size * DOT;
  const stacked = layout === 'stacked';

  return (
    <View
      accessible
      accessibilityLabel={t('brand.name')}
      accessibilityRole={header ? 'header' : undefined}
      style={{
        flexDirection: stacked ? 'column' : 'row',
        alignItems: stacked ? 'center' : 'flex-start',
        columnGap: size * 0.26,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <Text allowFontScaling={false} style={[word, { color: yerim }]}>
          Yer
        </Text>
        <View>
          <Text allowFontScaling={false} style={[word, { color: yerim }]}>
            {'ı'}
          </Text>
          <View
            style={{
              position: 'absolute',
              top: size * DOT_TOP,
              left: '50%',
              width: dot,
              height: dot,
              marginLeft: -dot / 2,
              borderRadius: dot / 2,
              backgroundColor: brand.orange,
            }}
          />
        </View>
        <Text allowFontScaling={false} style={[word, { color: yerim }]}>
          m
        </Text>
      </View>
      {/* Stacked: the second line tucks under the first, as in the logo. */}
      <Text
        allowFontScaling={false}
        style={[word, { color: brand.orange }, stacked && { marginTop: -size * 0.34 }]}
      >
        Var
      </Text>
    </View>
  );
}
