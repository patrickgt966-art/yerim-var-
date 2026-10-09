import { View } from 'react-native';

import { asym, brand, fonts } from '@/theme';

import { Txt } from './Txt';

/** Orange tile with a navy display "P": the brand mark on the hero and tab bar. */
export function PMark({ size = 30, radius }: { size?: number; radius?: number }) {
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        asym(radius ?? size * 0.3, radius ? radius * 0.3 : size * 0.1),
        {
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: brand.orange,
        },
      ]}
    >
      <Txt
        allowFontScaling={false}
        color={brand.navy}
        style={{ fontFamily: fonts.display, fontSize: size * 0.6, lineHeight: size * 0.76 }}
      >
        P
      </Txt>
    </View>
  );
}
