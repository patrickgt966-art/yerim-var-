import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Line } from 'react-native-svg';

import { useColors } from '@/theme';

/** A dashed line across a card, drawn (RN's dashed borders only work on all four sides). */
export function Dashes({ color, opacity = 1 }: { color: string; opacity?: number }) {
  return (
    <Svg height={2} width="100%" accessible={false}>
      <Line
        x1={0}
        y1={1}
        x2="100%"
        y2={1}
        stroke={color}
        strokeOpacity={opacity}
        strokeWidth={2}
        strokeDasharray="6 5"
      />
    </Svg>
  );
}

/**
 * The two half-circle notches and the tear line of a paper ticket, laid over a card at `top`.
 * The notches take the page colour so they read as cut out.
 */
export function TicketCut({ top, color }: { top: number; color: string }) {
  const c = useColors();
  const notch = {
    position: 'absolute' as const,
    top: top - 7,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: c.bg,
  };
  return (
    <>
      <View pointerEvents="none" style={[notch, { left: -7 }]} />
      <View pointerEvents="none" style={[notch, { right: -7 }]} />
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: top - 1, left: 12, right: 12 }}
      >
        <Dashes color={color} opacity={0.3} />
      </View>
    </>
  );
}

/** A small dot with a soft ring breathing out of it: the number next to it is live. */
export function LivePulse({ color, size = 8 }: { color: string; size?: number }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (!reduce) p.value = withRepeat(withTiming(1, { duration: 1800 }), -1, false);
  }, [p, reduce]);
  const ring = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - p.value),
    transform: [{ scale: 1 + 1.6 * p.value }],
  }));
  const dot = { position: 'absolute' as const, inset: 0, borderRadius: size / 2 };
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden>
      <Animated.View style={[dot, { backgroundColor: color }, ring]} />
      <View style={[dot, { backgroundColor: color }]} />
    </View>
  );
}
