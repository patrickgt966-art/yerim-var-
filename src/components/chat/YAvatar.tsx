import { View } from 'react-native';

import { Txt } from '@/components/Txt';
import { fonts, useColors } from '@/theme';

/** The "Y" tile: navy square, orange letter. Decorative; the name is spoken elsewhere. */
export function YAvatar({ size = 30 }: { size?: number }) {
  const c = useColors();
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.36),
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: c.hero,
      }}
    >
      <Txt
        allowFontScaling={false}
        color={c.accent}
        style={{
          fontFamily: fonts.display,
          fontSize: Math.round(size * 0.46),
          lineHeight: Math.round(size * 0.58),
        }}
      >
        Y
      </Txt>
    </View>
  );
}
