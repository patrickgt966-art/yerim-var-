import { Text, type TextProps } from 'react-native';

import { fonts, useColors } from '@/theme';

type Variant = 'display' | 'title' | 'body' | 'bodyBold' | 'caption' | 'label';

const sizes: Record<Variant, { fontFamily: string; fontSize: number; lineHeight?: number }> = {
  display: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44 },
  title: { fontFamily: fonts.display, fontSize: 21, lineHeight: 26 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21 },
  bodyBold: { fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 21 },
  caption: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fonts.bodyBold, fontSize: 12, lineHeight: 16 },
};

type Props = TextProps & { variant?: Variant; color?: string; secondary?: boolean };

/** Text with brand fonts. Font scaling stays on for Dynamic Type. */
export function Txt({ variant = 'body', color, secondary, style, ...rest }: Props) {
  const c = useColors();
  return (
    <Text
      maxFontSizeMultiplier={variant === 'display' ? 1.6 : 2.2}
      style={[sizes[variant], { color: color ?? (secondary ? c.textSecondary : c.text) }, style]}
      {...rest}
    />
  );
}
