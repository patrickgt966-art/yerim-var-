import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { ROUTER_TIMEOUT_MS } from '@/lib/ai/protocol';
import { brand, useColors } from '@/theme';

/** A softly breathing ✨ while the AI reads the message; still when reduce-motion is on. */
export function ThinkingSparkle() {
  const reduce = useReducedMotion();
  const s = useSharedValue(1);
  useEffect(() => {
    if (reduce) {
      s.value = 1;
      return;
    }
    const ease = Easing.inOut(Easing.ease);
    s.value = withRepeat(
      withSequence(
        withTiming(1.18, { duration: 700, easing: ease }),
        withTiming(0.9, { duration: 700, easing: ease }),
      ),
      -1,
      true,
    );
  }, [reduce, s]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: s.value }, { rotate: `${(s.value - 1) * 40}deg` }],
    opacity: 0.75 + (s.value - 0.9) * 0.9,
  }));
  return (
    <Animated.View style={style} accessible={false}>
      <Text style={{ fontSize: 18, lineHeight: 22 }}>✨</Text>
    </Animated.View>
  );
}

/**
 * A thin bar that fills over the router's wait (fast at first, then slower), so a long answer
 * reads as progress, not a hang. It never reaches the end on its own: the reply replaces it.
 */
export function ThinkingBar() {
  const c = useColors();
  const reduce = useReducedMotion();
  const p = useSharedValue(reduce ? 0.5 : 0.04);
  useEffect(() => {
    if (reduce) return;
    p.value = withTiming(0.92, {
      duration: ROUTER_TIMEOUT_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [reduce, p]);
  const style = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));
  return (
    <View
      accessible={false}
      style={{ height: 3, borderRadius: 2, backgroundColor: c.chipBg, overflow: 'hidden' }}
    >
      <Animated.View
        style={[{ height: 3, borderRadius: 2, backgroundColor: brand.orange }, style]}
      />
    </View>
  );
}
