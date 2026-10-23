import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Rect } from 'react-native-svg';

import { BrandWordmark } from '@/components/BrandWordmark';
import { Button } from '@/components/Button';
import { Txt } from '@/components/Txt';
import { useScreenReader } from '@/lib/a11y';
import { feel } from '@/lib/haptics';
import { asym, brand, fonts, HIT, useColors } from '@/theme';

import { Mascot, MascotFace, type MascotPose } from './Mascot';

/**
 * When each beat starts (ms). A calm, short story in the app's own look: the Yerim button drops
 * onto the page asleep, wakes up and stands up as Yerim, says hello while the words type in,
 * shows what it finds (food, then parking), hops into a parking bay drawn under it ("yerim var!")
 * and hands over to the first step.
 */
const BEATS = {
  wake: 1000,
  stand: 1500,
  hello: 2100,
  food: 3500,
  park: 4500,
  bay: 5500,
  done: 6600,
} as const;
type Beat = 'drop' | keyof typeof BEATS;
const ORDER: Beat[] = ['drop', 'wake', 'stand', 'hello', 'food', 'park', 'bay', 'done'];
const after = (a: Beat, b: Beat) => ORDER.indexOf(a) >= ORDER.indexOf(b);

const SIZE = 170;
const TILE = 74;
const TYPE_MS = 45;
const SPRING = { damping: 9, stiffness: 160, mass: 0.7 };

/** Text that types in one letter at a time once `on`; the full line is what screen readers get. */
function useTyped(text: string, on: boolean, instant: boolean) {
  const [n, setN] = useState(instant ? text.length : 0);
  useEffect(() => {
    if (!on || instant) return;
    const id = setInterval(() => {
      setN((x) => {
        if (x >= text.length) {
          clearInterval(id);
          return x;
        }
        return x + 1;
      });
    }, TYPE_MS);
    return () => clearInterval(id);
  }, [on, instant, text]);
  return instant ? text : on ? text.slice(0, n) : '';
}

/**
 * Yerim's welcome on the very first launch, before the city question. About seven seconds,
 * skippable at any time; with Reduce Motion it is the last frame at once.
 */
export function WelcomeIntro({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const c = useColors();
  const insets = useSafeAreaInsets();
  // Reduce Motion, or a screen reader (it would wait seven seconds for the button): the last frame.
  const motionOff = useReducedMotion();
  const screenReader = useScreenReader();
  const reduce = motionOff || screenReader;
  const [beatState, setBeat] = useState<Beat>(motionOff ? 'done' : 'drop');
  const beat: Beat = reduce ? 'done' : beatState;
  const [wave, setWave] = useState(false);

  useEffect(() => {
    if (reduce) return;
    const ids = (Object.entries(BEATS) as [Beat, number][]).map(([b, ms]) =>
      setTimeout(() => setBeat(b), ms),
    );
    // A light tap each time Yerim lands: on the page, standing up, in the parking bay.
    for (const ms of [380, BEATS.stand + 300, BEATS.bay + 300])
      ids.push(setTimeout(() => feel('land'), ms));
    return () => ids.forEach(clearTimeout);
  }, [reduce]);
  // A wave is two arm positions, swapped quickly while saying hello.
  useEffect(() => {
    if (reduce || beat !== 'hello') return;
    const id = setInterval(() => setWave((w) => !w), 220);
    return () => clearInterval(id);
  }, [beat, reduce]);

  // The tile drops in and lands squashed; later the whole mascot hops into the bay.
  const y = useSharedValue(reduce ? 0 : -260);
  const sx = useSharedValue(1);
  const sy = useSharedValue(1);
  const bay = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) {
      y.value = 0;
      sx.value = 1;
      sy.value = 1;
      bay.value = 1;
      return;
    }
    if (beat === 'drop') {
      y.value = withSpring(0, SPRING);
      sx.value = withDelay(
        380,
        withSequence(withTiming(1.2, { duration: 90 }), withSpring(1, SPRING)),
      );
      sy.value = withDelay(
        380,
        withSequence(withTiming(0.78, { duration: 90 }), withSpring(1, SPRING)),
      );
    }
    if (beat === 'stand' || beat === 'bay') {
      const lift = beat === 'bay' ? -46 : -20;
      y.value = withSequence(
        withTiming(lift, { duration: 220, easing: Easing.out(Easing.quad) }),
        withSpring(0, SPRING),
      );
      sx.value = withSequence(
        withTiming(0.9, { duration: 120 }),
        withDelay(160, withTiming(1.16, { duration: 80 })),
        withSpring(1, SPRING),
      );
      sy.value = withSequence(
        withTiming(1.12, { duration: 120 }),
        withDelay(160, withTiming(0.82, { duration: 80 })),
        withSpring(1, SPRING),
      );
    }
    if (beat === 'bay')
      bay.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) });
  }, [beat, reduce, y, sx, sy, bay]);
  const bodyStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }, { scaleX: sx.value }, { scaleY: sy.value }],
  }));
  const bayStyle = useAnimatedStyle(() => ({
    opacity: bay.value,
    transform: [{ scaleX: 0.6 + 0.4 * bay.value }],
  }));

  const hello = t('welcome.hello');
  const food = t('welcome.food');
  const park = t('welcome.park');
  const typedHello = useTyped(hello, after(beat, 'hello'), reduce);
  const typedFood = useTyped(food, after(beat, 'food'), reduce);
  const typedPark = useTyped(park, after(beat, 'park'), reduce);

  const standing = after(beat, 'stand');
  const pose: MascotPose = after(beat, 'bay')
    ? { eyes: 'happy', mouth: 'open', arm: 'up' }
    : after(beat, 'park')
      ? { eyes: 'open', mouth: 'smile', prop: 'park' }
      : after(beat, 'food')
        ? { eyes: 'happy', mouth: 'open', prop: 'fork' }
        : beat === 'hello'
          ? { eyes: 'open', mouth: 'open', arm: wave ? 'wave' : 'wave2' }
          : { eyes: 'open', mouth: 'smile' };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.bg,
        paddingTop: insets.top + 8,
        paddingBottom: insets.bottom + 16,
        paddingHorizontal: 16,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('welcome.skip')}
        onPress={onDone}
        hitSlop={8}
        style={{
          alignSelf: 'flex-end',
          minWidth: HIT,
          minHeight: HIT,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Txt style={{ fontFamily: fonts.bodyBold, fontSize: 15 }} color={c.textSecondary}>
          {t('welcome.skip')}
        </Txt>
      </Pressable>

      <View
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${hello} ${food} ${park}`}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 }}
      >
        {/* The stage: a parking bay is drawn under Yerim at the end. */}
        <View
          style={{
            width: SIZE + 60,
            height: SIZE,
            alignItems: 'center',
            justifyContent: 'flex-end',
          }}
        >
          <Animated.View style={[{ position: 'absolute', bottom: -6 }, bayStyle]}>
            <Svg width={SIZE + 40} height={34}>
              <Rect
                x={2}
                y={2}
                width={SIZE + 36}
                height={30}
                rx={10}
                fill={c.mintSoft}
                stroke={c.mintText}
                strokeWidth={2.5}
                strokeDasharray="9 7"
              />
            </Svg>
          </Animated.View>
          <Animated.View
            style={[
              { alignItems: 'center', justifyContent: 'flex-end', transformOrigin: 'bottom' },
              bodyStyle,
            ]}
          >
            {standing ? (
              <Mascot size={SIZE} {...pose} />
            ) : (
              <View
                style={[
                  asym(26, 9),
                  {
                    width: TILE,
                    height: TILE,
                    marginBottom: 16,
                    backgroundColor: brand.orange,
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: [{ rotate: '-4deg' }],
                  },
                ]}
              >
                <MascotFace size={40} eyes={after(beat, 'wake') ? 'open' : 'blink'} />
              </View>
            )}
          </Animated.View>
        </View>

        <View accessible={false} style={{ alignItems: 'center', gap: 4, minHeight: 120 }}>
          <Txt
            accessible={false}
            style={{
              fontFamily: fonts.display,
              fontSize: 32,
              lineHeight: 38,
              letterSpacing: -0.6,
              textAlign: 'center',
            }}
          >
            {typedHello || ' '}
          </Txt>
          <Txt
            accessible={false}
            style={{ fontSize: 17, lineHeight: 24, textAlign: 'center' }}
            color={c.peachText}
          >
            {typedFood || ' '}
          </Txt>
          <Txt
            accessible={false}
            style={{ fontSize: 17, lineHeight: 24, textAlign: 'center' }}
            color={c.mintText}
          >
            {typedPark || ' '}
          </Txt>
        </View>
        <View style={{ opacity: after(beat, 'bay') ? 1 : 0 }}>
          <BrandWordmark layout="inline" tone="onLight" size={26} />
        </View>
      </View>

      <View
        style={{ opacity: after(beat, 'done') ? 1 : 0 }}
        pointerEvents={after(beat, 'done') ? 'auto' : 'none'}
        accessibilityElementsHidden={!after(beat, 'done')}
        importantForAccessibility={after(beat, 'done') ? 'auto' : 'no-hide-descendants'}
      >
        <Button label={t('welcome.start')} onPress={onDone} />
      </View>
    </View>
  );
}
