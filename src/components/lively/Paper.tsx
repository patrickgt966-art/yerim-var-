import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';

import { useColors, useIsDark } from '@/theme';

/**
 * The page's paper: a faint grid of dots behind the content, so the background reads as paper,
 * not a flat digital fill. Decorative; draw it first inside a screen's root view.
 */
export function Paper() {
  const c = useColors();
  const dark = useIsDark();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="paperDots" width={14} height={14} patternUnits="userSpaceOnUse">
            <Circle cx={7} cy={7} r={1} fill={c.ink} fillOpacity={dark ? 0.06 : 0.07} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#paperDots)" />
      </Svg>
    </View>
  );
}
