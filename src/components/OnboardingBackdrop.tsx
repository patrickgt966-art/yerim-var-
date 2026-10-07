import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Ferry, Skyline } from './Skyline';

const BAY_H = 112;

function Bays({ side, height }: { side: 'left' | 'right'; height: number }) {
  const rows = Math.ceil(height / BAY_H) + 1;
  return (
    <View style={[styles.column, side === 'left' ? { left: -6 } : { right: -6 }]}>
      {Array.from({ length: rows }, (_, i) => (
        <View
          key={i}
          style={{
            height: BAY_H - 8,
            marginBottom: 8,
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: 'rgba(255,255,255,0.18)',
            borderRadius: 10,
            ...(side === 'left' ? { borderLeftWidth: 0 } : { borderRightWidth: 0 }),
          }}
        />
      ))}
    </View>
  );
}

function DrivingCar({
  side,
  duration,
  height,
  delay,
  orange,
}: {
  side: 'left' | 'right';
  duration: number;
  height: number;
  delay: number;
  orange?: boolean;
}) {
  const reduce = useReducedMotion();
  const y = useSharedValue(side === 'left' ? height : -80);
  useEffect(() => {
    if (reduce) return;
    y.value = withDelay(
      delay,
      withRepeat(
        withTiming(side === 'left' ? -80 : height, { duration, easing: Easing.linear }),
        -1,
        false,
      ),
    );
  }, [reduce, side, duration, height, delay, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Animated.View
      style={[
        styles.car,
        side === 'left' ? { left: 14 } : { right: 14 },
        {
          top: reduce ? height * (side === 'left' ? 0.3 : 0.6) : 0,
          backgroundColor: orange ? 'rgba(255,138,31,0.55)' : 'rgba(255,255,255,0.28)',
        },
        style,
      ]}
    >
      <View style={styles.window} />
      <View style={[styles.window, { height: 6 }]} />
    </Animated.View>
  );
}

/** Animated parking-lot background with the İzmir skyline. Respects Reduce Motion. */
export function OnboardingBackdrop() {
  const { width, height } = useWindowDimensions();
  const reduce = useReducedMotion();
  const ferryX = useSharedValue(-90);
  const glow = useSharedValue(0);

  useEffect(() => {
    if (reduce) return;
    ferryX.value = withRepeat(
      withTiming(width + 60, { duration: 24000, easing: Easing.linear }),
      -1,
      false,
    );
    glow.value = withRepeat(
      withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [reduce, width, ferryX, glow]);

  const ferryStyle = useAnimatedStyle(() => ({ transform: [{ translateX: ferryX.value }] }));
  const glowStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: -40 * glow.value },
      { translateY: 50 * glow.value },
      { scale: 1 + 0.15 * glow.value },
    ],
  }));

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[styles.glow, { right: -120, top: -80 }, glowStyle]} />
      <View
        style={[
          styles.glow,
          { left: width / 2 - 140, bottom: -60, backgroundColor: 'rgba(255,138,31,0.18)' },
        ]}
      />
      <Bays side="left" height={height} />
      <Bays side="right" height={height} />
      <DrivingCar side="left" duration={16000} height={height} delay={0} />
      <DrivingCar side="right" duration={20000} height={height} delay={1500} orange />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 90, alignItems: 'center' }}>
        <Skyline
          width={width}
          height={(width * 150) / 230}
          tint="rgba(255,255,255,0.1)"
          bg="#0B3C49"
        />
      </View>
      <Animated.View style={[{ position: 'absolute', bottom: 120 }, ferryStyle]}>
        <Ferry width={56} height={25} color="rgba(255,255,255,0.35)" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { position: 'absolute', top: 0, bottom: 0, width: 54 },
  car: {
    position: 'absolute',
    width: 26,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  window: { width: 16, height: 8, borderRadius: 3, backgroundColor: '#0B3C49' },
  glow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(14,124,107,0.35)',
  },
});
