import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  BackHandler,
  findNodeHandle,
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';

import { Txt } from '@/components/Txt';
import { COACH_STEPS, resolveStep, useCoach, useCoachHydrated } from '@/store/coach';
import { brand, fonts, HIT, useColors } from '@/theme';

import { measureAllTargets, measureTarget, useCoachRegistry } from './registry';

/** Gap between the bubble and the screen edge. */
const GUTTER = 16;
/** Space around the highlighted target. */
const PAD = 6;
const ARROW = 10;
/** The home screen has to be on screen this long before the tour starts. */
export const COACH_START_DELAY = 600;

const DIM = '#0B3C49B3';
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * One-time tour of the home screen: a dimmed screen, the current target lit, and a bubble with
 * an arrow. Not a Modal: it is an absolute layer rendered at the end of the tabs layout, so it
 * sits above the tab bar. Any tap on the bubble, the dimmed area or the target goes on; "Geç" ends it.
 */
export function CoachOverlay() {
  const { t } = useTranslation();
  const c = useColors();
  const reduce = useReducedMotion();
  const { width: W, height: H } = useWindowDimensions();
  const hydrated = useCoachHydrated();
  const done = useCoach((s) => s.coachDone);
  const step = useCoach((s) => s.step);
  const homeFocused = useCoachRegistry((s) => s.homeFocused);
  const rects = useCoachRegistry((s) => s.rects);
  const [armed, setArmed] = useState(false);
  const bubbleRef = useRef<View>(null);

  // Steps whose target is measured and on screen. The ✨ pill, for one, may not exist.
  const available = COACH_STEPS.filter((k) => {
    const r = rects[k];
    return !!r && r.y + r.h > 0 && r.y < H && r.x + r.w > 0 && r.x < W;
  });
  const index = resolveStep(step, available);
  const key = index == null ? null : COACH_STEPS[index];

  // Home has laid out (the city button and the search card are measured) and is focused.
  const ready = hydrated && !done && homeFocused && !!rects.city && !!rects.search;
  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => {
      measureAllTargets();
      setArmed(true);
    }, COACH_START_DELAY);
    return () => {
      clearTimeout(id);
      setArmed(false);
    };
  }, [ready]);

  const shown = armed && ready && key != null;

  // A scroll or a rotation moves targets without a layout event: measure again.
  useEffect(() => {
    if (shown && key) measureTarget(key);
  }, [shown, key, W, H]);

  // Move screen-reader focus to the new bubble so it reads out.
  useEffect(() => {
    if (!shown) return;
    const id = setTimeout(() => {
      const node = bubbleRef.current ? findNodeHandle(bubbleRef.current) : null;
      if (node != null) AccessibilityInfo.setAccessibilityFocus(node);
    }, 300);
    return () => clearTimeout(id);
  }, [shown, key]);

  // Android back ends the tour instead of leaving the app.
  useEffect(() => {
    if (!shown) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      useCoach.getState().skip();
      return true;
    });
    return () => sub.remove();
  }, [shown]);

  const rect = key ? rects[key] : undefined;
  if (!shown || !key || !rect) return null;

  const next = () => useCoach.getState().next(available);
  const skip = () => useCoach.getState().skip();

  const hole = { x: rect.x - PAD, y: rect.y - PAD, w: rect.w + 2 * PAD, h: rect.h + 2 * PAD };
  const holeBottom = hole.y + hole.h;
  const bw = Math.min(W - 2 * GUTTER, 320);
  const centerX = rect.x + rect.w / 2;
  const left = clamp(centerX - bw / 2, GUTTER, W - GUTTER - bw);
  const arrowLeft = clamp(centerX - left, 24, bw - 24) - ARROW;
  // More room below the target than above: bubble below, else above.
  const below = H - holeBottom >= hole.y;
  const arrow = (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        marginLeft: arrowLeft,
        width: 0,
        height: 0,
        borderLeftWidth: ARROW,
        borderRightWidth: ARROW,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        ...(below
          ? { borderBottomWidth: ARROW, borderBottomColor: brand.white, marginBottom: -1 }
          : { borderTopWidth: ARROW, borderTopColor: brand.white, marginTop: -1 }),
      }}
    />
  );
  const skipLink = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('coach.skip')}
      onPress={skip}
      hitSlop={8}
      style={{
        minWidth: HIT,
        minHeight: HIT,
        alignSelf: 'flex-end',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 8,
      }}
    >
      <Txt
        allowFontScaling={false}
        style={{ fontFamily: fonts.bodyBold, fontSize: 15, textDecorationLine: 'underline' }}
        color={brand.white}
      >
        {t('coach.skip')}
      </Txt>
    </Pressable>
  );
  const text = t(`coach.${key}`);
  const position = index == null ? 0 : available.indexOf(key);
  const card = (
    <Pressable
      ref={bubbleRef}
      accessible
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityHint={t('coach.a11yHint')}
      accessibilityValue={{
        text: t('coach.a11yStep', { n: position + 1, total: available.length }),
      }}
      onPress={next}
      style={{
        padding: 16,
        borderRadius: 18,
        backgroundColor: brand.white,
        borderLeftWidth: 5,
        borderLeftColor: brand.orange,
        gap: 10,
        shadowColor: brand.navy,
        shadowOpacity: 0.3,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 8,
      }}
    >
      <Txt style={{ fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 23 }} color={brand.navy}>
        {text}
      </Txt>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ flexDirection: 'row', gap: 6 }}
      >
        {available.map((k, i) => (
          <View
            key={k}
            style={{
              width: i === position ? 18 : 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: i === position ? brand.orange : c.badgeNearBg,
            }}
          />
        ))}
      </View>
    </Pressable>
  );

  const dim = { position: 'absolute', backgroundColor: DIM } as const;
  return (
    <Animated.View
      entering={reduce ? undefined : FadeIn.duration(200)}
      accessibilityViewIsModal
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        // Above the tab bar and its raised button (they have an elevation on Android).
        zIndex: 1000,
        elevation: 40,
      }}
    >
      {/* Any tap outside the bubble: next step. Dim pieces leave a hole around the target. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('coach.next')}
        onPress={next}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      >
        <View style={{ ...dim, top: 0, left: 0, right: 0, height: Math.max(0, hole.y) }} />
        <View style={{ ...dim, top: holeBottom, left: 0, right: 0, bottom: 0 }} />
        <View
          style={{ ...dim, top: hole.y, height: hole.h, left: 0, width: Math.max(0, hole.x) }}
        />
        <View style={{ ...dim, top: hole.y, height: hole.h, left: hole.x + hole.w, right: 0 }} />
        <View
          style={{
            position: 'absolute',
            top: hole.y,
            left: hole.x,
            width: hole.w,
            height: hole.h,
            borderRadius: 18,
            borderWidth: 2,
            borderColor: brand.orange,
          }}
        />
      </View>
      <Animated.View
        key={key}
        entering={reduce ? undefined : FadeIn.duration(180)}
        style={{
          position: 'absolute',
          left,
          width: bw,
          ...(below ? { top: holeBottom + 2 } : { bottom: H - hole.y + 2 }),
        }}
      >
        {below ? (
          <>
            {arrow}
            {card}
            {skipLink}
          </>
        ) : (
          <>
            {skipLink}
            {card}
            {arrow}
          </>
        )}
      </Animated.View>
    </Animated.View>
  );
}
