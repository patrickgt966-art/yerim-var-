import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useColors } from '@/theme';

const DOT = 7;
const STEP = 160;

function Dot({ index, reduce, color }: { index: number; reduce: boolean; color: string }) {
  const o = useSharedValue(index === 1 ? 1 : 0.55);
  useEffect(() => {
    if (reduce) {
      o.value = index === 1 ? 1 : 0.55;
      return;
    }
    o.value = withDelay(
      index * STEP,
      withRepeat(
        withSequence(
          withTiming(1, { duration: STEP * 2 }),
          withTiming(0.35, { duration: STEP * 2 }),
        ),
        -1,
        false,
      ),
    );
  }, [index, reduce, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      style={[{ width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: color }, style]}
    />
  );
}

/** Three softly pulsing dots; static when reduce-motion is on. */
export function TypingDots() {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      {[0, 1, 2].map((i) => (
        <Dot key={i} index={i} reduce={reduce} color={c.textSecondary} />
      ))}
    </View>
  );
}
