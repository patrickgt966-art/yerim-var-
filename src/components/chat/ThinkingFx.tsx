import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { ROUTER_TIMEOUT_MS } from '@/lib/ai/protocol';
import { brand, useColors } from '@/theme';

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
