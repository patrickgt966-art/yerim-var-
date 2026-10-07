import { Pressable, View } from 'react-native';

import { asym, HIT, useColors } from '@/theme';

import { DashedFrame } from './DashedFrame';
import { Icon, type IconName } from './Icon';
import { Txt } from './Txt';

type Props = {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: IconName;
  height?: number;
};

/** Selected chips are solid navy; others are a dashed bay. */
export function Chip({ label, selected, onPress, icon, height = HIT }: Props) {
  const c = useColors();
  const fg = selected ? c.onPrimary : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        asym(height / 2, 6),
        {
          minHeight: height,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: selected ? c.primary : c.card,
        },
      ]}
    >
      {!selected && <DashedFrame color={c.dashed} radius={height / 2} tight={6} />}
      {icon && (
        <View>
          <Icon name={icon} size={16} color={fg} strokeWidth={2.2} />
        </View>
      )}
      <Txt variant="bodyBold" color={fg} style={{ fontSize: 14 }}>
        {label}
      </Txt>
    </Pressable>
  );
}
