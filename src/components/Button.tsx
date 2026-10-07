import { Pressable, type PressableProps, type ViewStyle } from 'react-native';

import { asym, fonts, HIT, useColors } from '@/theme';

import { Txt } from './Txt';

type Props = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  kind?: 'primary' | 'secondary' | 'danger';
  style?: ViewStyle;
};

export function Button({ label, kind = 'primary', style, accessibilityLabel, ...rest }: Props) {
  const c = useColors();
  const bg = kind === 'primary' ? c.primary : c.card;
  const fg = kind === 'primary' ? c.onPrimary : kind === 'danger' ? c.full : c.text;
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
          borderWidth: kind === 'primary' ? 0 : 1,
          borderColor: c.line,
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
      {...rest}
    >
      <Txt
        style={{
          fontFamily: kind === 'primary' ? fonts.display : fonts.bodyBold,
          fontSize: kind === 'primary' ? 16 : 15,
        }}
        color={fg}
        numberOfLines={2}
      >
        {label}
      </Txt>
    </Pressable>
  );
}
