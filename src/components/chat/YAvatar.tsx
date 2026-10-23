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

import { MascotFace } from '@/components/mascot/Mascot';
import { asym, brand } from '@/theme';

/**
 * Yerim's face in the chat: the mascot's orange tile (the Yerim button's shape) with its face.
 * While the AI works (`thinking`) it looks up and bobs a little, like it is thinking it over;
 * with places in the reply (`happy`) its eyes smile. Still when reduce-motion is on.
 * Decorative; the name is spoken elsewhere.
 */
export function YAvatar({
  size = 30,
  thinking = false,
  happy = false,
}: {
  size?: number;
  thinking?: boolean;
  happy?: boolean;
}) {
  const reduce = useReducedMotion();
  const bob = useSharedValue(0);
  useEffect(() => {
    if (!thinking || reduce) {
      bob.value = withTiming(0, { duration: 200 });
      return;
    }
    const ease = Easing.inOut(Easing.quad);
    bob.value = withRepeat(
      withSequence(
        withTiming(-size * 0.08, { duration: 420, easing: ease }),
        withTiming(0, { duration: 420, easing: ease }),
      ),
      -1,
      false,
    );
  }, [thinking, reduce, bob, size]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: bob.value }, { rotate: '-4deg' }],
  }));
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ width: size, height: size }}
    >
      <Animated.View
        style={[
          asym(Math.round(size * 0.36), Math.max(2, Math.round(size * 0.12))),
          {
            width: size,
            height: size,
            backgroundColor: brand.orange,
            alignItems: 'center',
            justifyContent: 'center',
          },
          style,
        ]}
      >
        <MascotFace
          size={Math.round(size * 0.72)}
          eyes={thinking ? 'up' : happy ? 'happy' : 'open'}
        />
      </Animated.View>
    </View>
  );
}
