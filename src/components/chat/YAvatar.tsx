import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { Txt } from '@/components/Txt';
import { brand, fonts, useColors } from '@/theme';

/**
 * Yerim's face: a round navy tile with a white "y" and the orange dot of the Yerim Var logo.
 * While the AI works (`thinking`) the dot breathes; still when reduce-motion is on.
 * Decorative; the name is spoken elsewhere.
 */
export function YAvatar({ size = 30, thinking = false }: { size?: number; thinking?: boolean }) {
  const c = useColors();
  const reduce = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (!thinking || reduce) {
      pulse.value = withTiming(1, { duration: 200 });
      return;
    }
    const ease = Easing.inOut(Easing.quad);
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.35, { duration: 520, easing: ease }),
        withTiming(1, { duration: 520, easing: ease }),
      ),
      -1,
      false,
    );
  }, [thinking, reduce, pulse]);
  const dotStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const dot = Math.max(6, Math.round(size * 0.26));
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id="yAvatarBg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#13525F" />
            <Stop offset="1" stopColor={c.hero} />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#yAvatarBg)" />
      </Svg>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Txt
          allowFontScaling={false}
          color="#FFFFFF"
          style={{
            fontFamily: fonts.display,
            fontSize: Math.round(size * 0.56),
            lineHeight: Math.round(size * 0.66),
            marginTop: -Math.round(size * 0.08),
          }}
        >
          y
        </Txt>
      </View>
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: -1,
            right: -1,
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            backgroundColor: brand.orange,
            borderWidth: Math.max(1.5, size * 0.05),
            borderColor: c.bg,
          },
          dotStyle,
        ]}
      />
    </View>
  );
}
