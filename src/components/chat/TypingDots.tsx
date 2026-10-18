import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { brand } from '@/theme';

const DOT = 8;
const STEP = 140;
/** Orange to peach: the brand's food colours. */
const COLORS = [brand.orange, '#FF9F45', brand.orangeLight] as const;

function Dot({ index, reduce }: { index: number; reduce: boolean }) {
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduce) {
      y.value = 0;
      return;
    }
    const ease = Easing.inOut(Easing.quad);
    // A wave: each dot hops a beat after the one before, then all rest a moment together.
    y.value = withDelay(
      index * STEP,
      withRepeat(
        withSequence(
          withTiming(-6, { duration: STEP * 2, easing: ease }),
          withTiming(0, { duration: STEP * 2, easing: ease }),
          withTiming(0, { duration: STEP * 3 }),
        ),
        -1,
        false,
      ),
    );
  }, [index, reduce, y]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }, { scale: 1 - y.value / 30 }],
    opacity: 0.7 - y.value / 20,
  }));
  return (
    <Animated.View
      style={[
        { width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: COLORS[index] },
        style,
      ]}
    />
  );
}

/** Three orange dots in a soft wave; still when reduce-motion is on. */
export function TypingDots() {
  const reduce = useReducedMotion();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 16 }}>
      {[0, 1, 2].map((i) => (
        <Dot key={i} index={i} reduce={reduce} />
      ))}
    </View>
  );
}
