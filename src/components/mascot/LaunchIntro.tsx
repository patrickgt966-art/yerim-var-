import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { BrandWordmark } from '@/components/BrandWordmark';
import { useApp } from '@/store/app';
import { asym, brand } from '@/theme';

import { MascotFace } from './Mascot';

/** The whole moment, from the native splash's last frame to the app (ms). */
export const LAUNCH_MS = 1050;
/** When the closing fade starts. */
const FADE_AT = 760;
const TILE = 54;
/** The native splash's background (app.json, expo-splash-screen), so the hand-off is seamless. */
const SPLASH_BG = '#FFFFFF';

/**
 * A one-second hello on every launch: it starts on the splash screen's logo, Yerim pops up
 * above it with a springy landing and a happy blink, then everything fades into the app.
 * Not on the very first launch (the welcome plays there), never with Reduce Motion; a tap skips it.
 */
export function LaunchIntro() {
  const reduce = useReducedMotion();
  // Decided once, on the launch itself: finishing onboarding later must not start it.
  const [show, setShow] = useState(() => useApp.getState().onboarded && !reduce);
  const [happy, setHappy] = useState(false);

  const pop = useSharedValue(0);
  const sx = useSharedValue(1);
  const sy = useSharedValue(1);
  const fade = useSharedValue(1);
  useEffect(() => {
    if (!show) return;
    const spring = { damping: 9, stiffness: 220, mass: 0.6 };
    pop.value = withDelay(120, withSpring(1, spring));
    sx.value = withDelay(
      330,
      withSequence(withTiming(1.2, { duration: 70 }), withSpring(1, spring)),
    );
    sy.value = withDelay(
      330,
      withSequence(withTiming(0.8, { duration: 70 }), withSpring(1, spring)),
    );
    fade.value = withDelay(
      FADE_AT,
      withTiming(0, { duration: LAUNCH_MS - FADE_AT, easing: Easing.in(Easing.quad) }),
    );
    const blink = setTimeout(() => setHappy(true), 480);
    const done = setTimeout(() => setShow(false), LAUNCH_MS);
    return () => {
      clearTimeout(blink);
      clearTimeout(done);
    };
  }, [show, pop, sx, sy, fade]);

  const layer = useAnimatedStyle(() => ({ opacity: fade.value }));
  const tile = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.value * 3),
    transform: [
      { translateY: (1 - pop.value) * 34 },
      { scale: 0.3 + 0.7 * pop.value },
      { scaleX: sx.value },
      { scaleY: sy.value },
      { rotate: '-4deg' },
    ],
  }));

  if (!show) return null;
  return (
    <Animated.View
      // Decorative and short: screen readers go straight to the app.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 2000,
          elevation: 50,
          backgroundColor: SPLASH_BG,
        },
        layer,
      ]}
    >
      <Pressable
        accessible={false}
        onPress={() => setShow(false)}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        {/* The logo stays where the splash drew it; Yerim lands on top of it. */}
        <View style={{ alignItems: 'center' }}>
          <Animated.View
            style={[
              asym(20, 7),
              {
                position: 'absolute',
                bottom: '100%',
                width: TILE,
                height: TILE,
                marginBottom: 6,
                backgroundColor: brand.orange,
                alignItems: 'center',
                justifyContent: 'center',
                transformOrigin: 'bottom',
              },
              tile,
            ]}
          >
            <MascotFace size={32} eyes={happy ? 'happy' : 'open'} />
          </Animated.View>
          <BrandWordmark layout="stacked" tone="onLight" size={50} />
        </View>
      </Pressable>
    </Animated.View>
  );
}
