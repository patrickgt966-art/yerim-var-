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

import { fonts } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Txt } from './Txt';

const BAY_H = 112;
const LINE = 'rgba(255,255,255,0.14)';

/** A column of dashed parking bays along one screen edge. */
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
            borderColor: LINE,
            borderRadius: 10,
            ...(side === 'left' ? { borderLeftWidth: 0 } : { borderRightWidth: 0 }),
          }}
        />
      ))}
    </View>
  );
}

type GlyphKind = IconName | 'P';

/** A small food or parking glyph that bobs slowly; static under Reduce Motion. */
function Floater({
  kind,
  x,
  y,
  size,
  delay,
  rotate,
}: {
  kind: GlyphKind;
  x: number;
  y: number;
  size: number;
  delay: number;
  rotate: number;
}) {
  const reduce = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    t.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.ease) }), -1, true),
    );
  }, [reduce, delay, t]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -10 * t.value }, { rotate: `${rotate}deg` }],
  }));
  const color = 'rgba(255,255,255,0.22)';
  return (
    <Animated.View style={[{ position: 'absolute', left: x, top: y }, style]}>
      {kind === 'P' ? (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size * 0.28,
            borderWidth: 1.5,
            borderColor: color,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Txt
            allowFontScaling={false}
            style={{ fontFamily: fonts.display, fontSize: size * 0.62, lineHeight: size * 0.8 }}
            color={color}
          >
            P
          </Txt>
        </View>
      ) : (
        <Icon name={kind} size={size} color={color} strokeWidth={1.8} />
      )}
    </Animated.View>
  );
}

/**
 * City-neutral background: dashed parking bays, soft brand-colour blobs and a few floating food and
 * parking glyphs. No landmarks, so it fits every city. Respects Reduce Motion.
 */
export function OnboardingBackdrop() {
  const { width, height } = useWindowDimensions();
  const reduce = useReducedMotion();
  const drift = useSharedValue(0);

  useEffect(() => {
    if (reduce) return;
    drift.value = withRepeat(
      withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [reduce, drift]);

  const blobStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: -40 * drift.value },
      { translateY: 50 * drift.value },
      { scale: 1 + 0.15 * drift.value },
    ],
  }));

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[styles.blob, { right: -120, top: -80 }, blobStyle]} />
      <View
        style={[
          styles.blob,
          { left: -140, top: height * 0.45, backgroundColor: 'rgba(255,138,31,0.14)' },
        ]}
      />
      <View
        style={[
          styles.blob,
          { left: width / 2 - 140, bottom: -110, backgroundColor: 'rgba(255,138,31,0.18)' },
        ]}
      />
      <Bays side="left" height={height} />
      <Bays side="right" height={height} />
      <Floater kind="cutlery" x={width * 0.14} y={height * 0.12} size={30} delay={0} rotate={-12} />
      <Floater kind="P" x={width * 0.74} y={height * 0.2} size={30} delay={900} rotate={8} />
      <Floater kind="cup" x={width * 0.8} y={height * 0.62} size={28} delay={1800} rotate={10} />
      <Floater kind="P" x={width * 0.1} y={height * 0.7} size={26} delay={600} rotate={-6} />
      <Floater kind="cup" x={width * 0.22} y={height * 0.86} size={24} delay={2400} rotate={-10} />
      <Floater
        kind="cutlery"
        x={width * 0.66}
        y={height * 0.88}
        size={26}
        delay={1300}
        rotate={14}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  column: { position: 'absolute', top: 0, bottom: 0, width: 54 },
  blob: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(14,124,107,0.35)',
  },
});
