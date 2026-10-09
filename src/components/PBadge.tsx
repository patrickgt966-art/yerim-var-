import { View } from 'react-native';

import { asym, fonts, useColors } from '@/theme';

import { Txt } from './Txt';

export function PBadge({ size = 22, inverted = false }: { size?: number; inverted?: boolean }) {
  const c = useColors();
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        asym(size * 0.32, size * 0.09),
        {
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: inverted ? '#FFFFFF' : c.primary,
        },
      ]}
    >
      <Txt
        allowFontScaling={false}
        style={{ fontFamily: fonts.display, fontSize: size * 0.64, lineHeight: size * 0.8 }}
        color={inverted ? '#0B3C49' : c.onPrimary}
      >
        P
      </Txt>
    </View>
  );
}
