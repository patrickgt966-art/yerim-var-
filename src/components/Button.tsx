import { Pressable, type PressableProps, type ViewStyle } from 'react-native';

import { asym, brand, fonts, HIT, useColors } from '@/theme';

import { Txt } from './Txt';

type Props = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  /** `accent`: the orange call to action (navy text on orange). */
  kind?: 'primary' | 'secondary' | 'danger' | 'accent';
  style?: ViewStyle;
};

export function Button({ label, kind = 'primary', style, accessibilityLabel, ...rest }: Props) {
  const c = useColors();
  const solid = kind === 'primary' || kind === 'accent';
  const bg = kind === 'primary' ? c.primary : kind === 'accent' ? c.accent : c.card;
  const fg =
    kind === 'primary'
      ? c.onPrimary
      : kind === 'accent'
        ? brand.navy
        : kind === 'danger'
          ? c.full
          : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        asym(16, 5),
        {
          minHeight: 48,
          minWidth: HIT,
          paddingHorizontal: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: bg,
          borderWidth: solid ? 0 : 1,
          borderColor: c.line,
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
      {...rest}
    >
      <Txt
        style={{
          fontFamily: solid ? fonts.display : fonts.bodyBold,
          fontSize: solid ? 16 : 15,
        }}
        color={fg}
        numberOfLines={2}
      >
        {label}
      </Txt>
    </Pressable>
  );
}
