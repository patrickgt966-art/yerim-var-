import { useEffect, useState } from 'react';
import { Pressable, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  Easing,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandWordmark } from '@/components/BrandWordmark';
import { useApp } from '@/store/app';
import {
  asym,
  brand,
  TAB_BAR_GAP,
  TAB_BAR_HEIGHT,
  TAB_BAR_OVERHANG,
  TAB_CENTER_SIZE,
} from '@/theme';

import { MascotFace } from './Mascot';

/** The whole moment, from the native splash's last frame to the app (ms). */
export const LAUNCH_MS = 650;
/** When Yerim leaves the logo for its button and the page opens. */
const GO_AT = 250;
/** How blurred home is when the white starts to clear (expo-blur intensity, 1-100). */
const BLUR = 70;
const TILE = 54;
const LOGO_SIZE = 50;
/** The stacked logo's height: two lines, the second tucked up (see BrandWordmark). */
const LOGO_H = LOGO_SIZE * (1.26 * 2 - 0.34);
/** The native splash's background (app.json, expo-splash-screen), so the hand-off is seamless. */
const SPLASH_BG = '#FFFFFF';
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;
const AnimatedBlur = Animated.createAnimatedComponent(BlurView);

/**
 * A short hello on every launch, with a transition into the app: it starts on the splash screen's
 * logo, Yerim pops up above it, then flies in an arc down into its own button in the tab bar while
 * the logo lifts away and the page comes into focus: the white thins into a blurred home, and the
 * blur clears, gradually, never in one jump. About 0.65 s; a tap skips it. iOS blurs the app
 * behind; on Android (no BlurTargetView around the whole app, which would cost on every frame)
 * expo-blur's default is a frosted veil that clears the same way.
 * Not on the very first launch (the welcome plays there), never with Reduce Motion.
 */
export function LaunchIntro() {
  const reduce = useReducedMotion();
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Decided once, on the launch itself: finishing onboarding later must not start it.
  const [show, setShow] = useState(() => useApp.getState().onboarded && !reduce);
  const [happy, setHappy] = useState(false);

  const pop = useSharedValue(0);
  const squash = useSharedValue(0);
  const go = useSharedValue(0);
  useEffect(() => {
    if (!show) return;
    pop.value = withSpring(1, { damping: 10, stiffness: 340, mass: 0.5 });
    squash.value = withDelay(
      140,
      withSequence(withTiming(1, { duration: 60 }), withSpring(0, { damping: 8, stiffness: 300 })),
    );
    go.value = withDelay(
      GO_AT,
      withTiming(1, { duration: LAUNCH_MS - GO_AT, easing: Easing.inOut(Easing.cubic) }),
    );
    const blink = setTimeout(() => setHappy(true), 180);
    const done = setTimeout(() => setShow(false), LAUNCH_MS);
    return () => {
      clearTimeout(blink);
      clearTimeout(done);
    };
  }, [show, pop, squash, go]);

  // Where Yerim rests above the logo, and where its button is in the tab bar (centres).
  const from = { x: W / 2, y: H / 2 - LOGO_H / 2 - 6 - TILE / 2 };
  const to = {
    x: W / 2,
    y:
      H - (insets.bottom + TAB_BAR_GAP) - (TAB_BAR_OVERHANG + TAB_BAR_HEIGHT) + TAB_CENTER_SIZE / 2,
  };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const grow = TAB_CENTER_SIZE / TILE;

  // White -> blurred home -> clear home: the white thins over the first half of the move, the
  // blur over all of it, slowest at the start, so home comes into focus.
  const white = useAnimatedStyle(() => ({
    opacity: interpolate(go.value, [0, 0.55], [1, 0], 'clamp'),
  }));
  const blur = useAnimatedProps(() => ({
    intensity: BLUR * (1 - go.value) * (1 - go.value),
  }));
  const veil = useAnimatedStyle(() => ({ opacity: go.value >= 0.98 ? 0 : 1 }));
  const logo = useAnimatedStyle(() => ({
    opacity: interpolate(go.value, [0, 0.6], [1, 0], 'clamp'),
    transform: [
      { translateY: -24 * go.value },
      { scale: interpolate(go.value, [0, 1], [1, 0.92]) },
    ],
  }));
  const tile = useAnimatedStyle(() => {
    const g = go.value;
    // An arc: up a little first, then down into the button.
    const arc = -70 * Math.sin(Math.PI * Math.min(1, g * 1.1));
    return {
      opacity: Math.min(1, pop.value * 3) * interpolate(g, [0.85, 1], [1, 0], 'clamp'),
      transform: [
        { translateX: dx * g },
        { translateY: (1 - pop.value) * 30 + dy * g + arc },
        { scale: (0.3 + 0.7 * pop.value) * (1 + (grow - 1) * g) },
        { scaleX: 1 + 0.18 * squash.value },
        { scaleY: 1 - 0.2 * squash.value },
        { rotate: '-4deg' },
      ],
    };
  });

  if (!show) return null;
  return (
    <Pressable
      // Decorative and short: screen readers go straight to the app.
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onPress={() => setShow(false)}
      style={[FILL, { zIndex: 2000, elevation: 50 }]}
    >
      <AnimatedBlur tint="light" style={[FILL, veil]} animatedProps={blur} />
      <Animated.View style={[FILL, { backgroundColor: SPLASH_BG }, white]} />
      {/* The logo stays where the splash drew it, then lifts away. */}
      <Animated.View style={[FILL, { alignItems: 'center', justifyContent: 'center' }, logo]}>
        <BrandWordmark layout="stacked" tone="onLight" size={LOGO_SIZE} />
      </Animated.View>
      <Animated.View
        style={[
          asym(20, 7),
          {
            position: 'absolute',
            left: from.x - TILE / 2,
            top: from.y - TILE / 2,
            width: TILE,
            height: TILE,
            backgroundColor: brand.orange,
            alignItems: 'center',
            justifyContent: 'center',
          },
          tile,
        ]}
      >
        <MascotFace size={32} eyes={happy ? 'happy' : 'open'} />
      </Animated.View>
    </Pressable>
  );
}
