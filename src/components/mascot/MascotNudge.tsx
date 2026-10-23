import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCoachRegistry } from '@/components/coach/registry';
import type { NearbyHome } from '@/components/home/useNearbyHome';
import { openFood } from '@/components/FoodHome';
import { Txt } from '@/components/Txt';
import { nearestRailStation } from '@/data/places';
import {
  formatDistance,
  getRestaurant,
  matchesCategory,
  restaurantsNear,
  type FoodCategory,
} from '@/data/restaurants';
import { useParkings } from '@/data/useParkings';
import { openDirections } from '@/lib/directions';
import { feel } from '@/lib/haptics';
import {
  chooseNudge,
  favFilling,
  favNearby,
  hardParking,
  meal,
  roundedCount,
  type Nudge,
} from '@/lib/nudge';
import { useApp } from '@/store/app';
import { useCoach, useCoachHydrated } from '@/store/coach';
import { useNudge, useNudgeHydrated } from '@/store/nudge';
import { asym, brand, fonts, HIT, TAB_BAR_GAP, TAB_BAR_HEIGHT, useColors } from '@/theme';

import { Mascot, MASCOT_FOOT, MASCOT_VIEWBOX, type MascotPose } from './Mascot';

/** Home has to be on screen this long before Yerim peeks: never during the first glance. */
const DELAY_MS = 2500;
/** Untouched, the peek goes back behind the tab bar after this long. */
const PEEK_MS = 8000;
/** Places of a category counted for the meal suggestion. */
const MEAL_RADIUS_M = 1000;
const SIZE = 86;

const POSES: Record<Nudge['kind'], MascotPose> = {
  favFilling: { eyes: 'side', mouth: 'smile', prop: 'park' },
  favNearby: { eyes: 'happy', mouth: 'smile', prop: 'star' },
  hardParking: { eyes: 'sad', mouth: 'flat', arm: 'point' },
  meal: { eyes: 'happy', mouth: 'open', prop: 'fork' },
};

/** `away`: on its way back behind the bar; `bye`: a happy hop before going away. */
type Phase = 'hidden' | 'peek' | 'open' | 'bye' | 'away';

/** The texts of a suggestion, in the user's language. */
function useNudgeText(n: Nudge | null) {
  const { t } = useTranslation();
  if (!n) return null;
  switch (n.kind) {
    case 'favFilling':
      return {
        title: t('nudge.favFilling.title', { name: n.fav.name }),
        body: t(n.fav.free > 0 ? 'nudge.favFilling.body' : 'nudge.favFilling.bodyFull', {
          count: n.fav.free,
          alt: n.alt.name,
          distance: formatDistance(n.alt.distanceM),
          free: n.alt.free,
        }),
        action: t('nudge.favFilling.action'),
      };
    case 'favNearby':
      return {
        title: t('nudge.favNearby.title'),
        body: t('nudge.favNearby.body', {
          name: n.place.name,
          distance: formatDistance(n.place.distanceM),
        }),
        action: t('nudge.favNearby.action'),
      };
    case 'hardParking':
      return {
        title: t('nudge.hardParking.title'),
        body: t('nudge.hardParking.body', { station: n.station.name, walk: n.station.walkMin }),
        action: t('nudge.hardParking.action'),
      };
    case 'meal': {
      const r = roundedCount(n.count);
      const what = t(`nudge.cats.${n.cat}`);
      return {
        title: t(`nudge.meal.${n.slot}`),
        body:
          r.key === 'few'
            ? t('nudge.meal.bodyFew', { count: r.count, what })
            : t(`nudge.meal.bodyOver${r.count}`, { what }),
        action: t('nudge.meal.action'),
      };
    }
  }
}

/**
 * Yerim's daily suggestion on the home screen. It first only peeks from behind the tab bar next
 * to the Yerim button with a one-line teaser; a tap opens the suggestion, "Sonra" or doing nothing
 * sends it back. At most one a day, never during the tour, never twice in a row the same kind
 * (except a favourite car park filling up), and two "Sonra" in a row keep it quiet for a week.
 */
export function MascotNudge({ nearby }: { nearby: Pick<NearbyHome, 'here'> }) {
  const { t } = useTranslation();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const reduce = useReducedMotion();
  const homeFocused = useCoachRegistry((s) => s.homeFocused);
  const coachReady = useCoachHydrated();
  const tourDone = useCoach((s) => s.coachDone);
  const nudgeReady = useNudgeHydrated();
  const enabled = useNudge((s) => s.enabled);
  const favorites = useApp((s) => s.favorites);
  const favoriteRestaurants = useApp((s) => s.favoriteRestaurants);
  const active = useApp((s) => s.active);
  const parkings = useParkings().data?.parkings;
  const here = nearby.here;

  const [nudge, setNudge] = useState<Nudge | null>(null);
  const [phase, setPhase] = useState<Phase>('hidden');
  const [decided, setDecided] = useState(false);

  const candidates = useMemo(() => {
    const now = new Date();
    const list = parkings ?? [];
    const savedPlaces = favoriteRestaurants
      .map((id) => getRestaurant(id))
      .filter((r): r is NonNullable<typeof r> => !!r);
    const countIn = (cat: FoodCategory) =>
      here
        ? restaurantsNear(here, MEAL_RADIUS_M, 5000).filter((r) => matchesCategory(r, cat)).length
        : 0;
    return [
      favFilling(favorites, list, here, now),
      favNearby(savedPlaces, here),
      // Someone parked already does not need a car park tip.
      active ? null : hardParking(list, here, here ? nearestRailStation(here) : null, now),
      meal(here, now, countIn),
    ].filter((n): n is Nudge => !!n);
  }, [parkings, favorites, favoriteRestaurants, here, active]);

  // Decide once per visit, a moment after home is on screen with a location.
  const ready =
    homeFocused && coachReady && tourDone && nudgeReady && enabled && !!here && !decided;
  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => {
      setDecided(true);
      const pick = chooseNudge(candidates, useNudge.getState(), new Date());
      if (!pick) return;
      useNudge.getState().shown(pick.kind);
      setNudge(pick);
      setPhase('peek');
      feel('land');
    }, DELAY_MS);
    return () => clearTimeout(id);
  }, [ready, candidates]);

  // Leaving home puts it away; untouched, the peek goes back by itself.
  useFocusEffect(useCallback(() => () => setPhase('hidden'), []));
  useEffect(() => {
    const next: Partial<Record<Phase, [Phase, number]>> = {
      peek: ['away', PEEK_MS],
      bye: ['away', 380],
      away: ['hidden', 600],
    };
    const step = next[phase];
    if (!step) return;
    const id = setTimeout(() => setPhase(step[0]), step[1]);
    return () => clearTimeout(id);
  }, [phase]);

  // 0: standing on the tab bar; PEEK: only the head shows; HIDDEN: all behind the bar.
  const h = (SIZE * MASCOT_VIEWBOX.h) / MASCOT_VIEWBOX.w;
  const HIDDEN = h;
  const PEEK = h * 0.52;
  const y = useSharedValue(HIDDEN);
  useEffect(() => {
    const to = phase === 'open' ? 0 : phase === 'peek' ? PEEK : phase === 'bye' ? -10 : HIDDEN;
    y.value = reduce
      ? withTiming(to, { duration: 0 })
      : withSpring(to, { damping: 11, stiffness: 170, mass: 0.8 });
  }, [phase, reduce, y, PEEK, HIDDEN]);
  const mascotStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  const text = useNudgeText(nudge);
  if (!nudge || !text || phase === 'hidden') return null;

  const barTop = insets.bottom + TAB_BAR_GAP + TAB_BAR_HEIGHT;
  const footFromTop = ((MASCOT_FOOT.y - MASCOT_VIEWBOX.y) / MASCOT_VIEWBOX.h) * h;
  const left = W / 2 + 40;
  const cardW = Math.min(320, W - 32);

  const open = () => {
    feel('tick');
    setPhase('open');
  };
  const act = () => {
    feel('yes');
    useNudge.getState().accepted();
    setPhase('bye');
    switch (nudge.kind) {
      case 'favFilling':
        router.push({ pathname: '/otopark/[id]', params: { id: nudge.alt.id } });
        break;
      case 'favNearby':
        router.push({ pathname: '/restoran/[id]', params: { id: nudge.place.id } });
        break;
      case 'hardParking':
        void openDirections(nudge.station, nudge.station.name, 'walk');
        break;
      case 'meal':
        openFood(nudge.here, t('results.myLocation'), nudge.cat);
        break;
    }
  };
  const later = () => {
    useNudge.getState().later();
    setPhase('away');
  };

  const pose: MascotPose =
    phase === 'bye' || phase === 'away'
      ? {
          eyes: 'happy',
          mouth: phase === 'bye' ? 'open' : 'smile',
          arm: phase === 'bye' ? 'up' : 'rest',
        }
      : phase === 'peek'
        ? { eyes: 'open', mouth: 'smile' }
        : POSES[nudge.kind];

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}
    >
      {/* The mascot is drawn under the floating tab bar, so a peek looks out from behind it. */}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left,
          bottom: barTop - (h - footFromTop),
          width: SIZE,
          height: h,
          overflow: 'visible',
        }}
      >
        <Animated.View style={mascotStyle}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              phase === 'peek' ? `${t('nudge.teaser')}: ${text.title}` : text.title
            }
            accessibilityHint={phase === 'peek' ? t('nudge.a11yOpen') : undefined}
            onPress={open}
            disabled={phase !== 'peek'}
          >
            <Mascot size={SIZE} {...pose} />
          </Pressable>
        </Animated.View>
      </View>

      {phase === 'peek' && (
        <Pressable
          accessible={false}
          onPress={open}
          style={[
            asym(14, 4),
            {
              position: 'absolute',
              left: left - 70,
              bottom: barTop + h - PEEK + 6,
              paddingHorizontal: 12,
              minHeight: 32,
              justifyContent: 'center',
              backgroundColor: c.card,
              borderWidth: 1,
              borderColor: brand.peachLine,
            },
          ]}
        >
          <Txt style={{ fontFamily: fonts.bodyExtraBold, fontSize: 13 }} color={brand.orangeStrong}>
            {t('nudge.teaser')}
          </Txt>
        </Pressable>
      )}

      {phase === 'open' && (
        <View
          accessibilityViewIsModal={false}
          style={{
            position: 'absolute',
            right: 16,
            width: cardW,
            bottom: barTop + h + 6,
            padding: 14,
            gap: 6,
            borderRadius: 20,
            borderBottomRightRadius: 6,
            backgroundColor: c.card,
            borderWidth: 1,
            borderColor: brand.peachLine,
            shadowColor: brand.navy,
            shadowOpacity: 0.22,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 8 },
            elevation: 10,
          }}
        >
          <Txt
            accessibilityRole="header"
            style={{ fontFamily: fonts.display, fontSize: 18, lineHeight: 23 }}
          >
            {text.title}
          </Txt>
          <Txt secondary style={{ fontSize: 14, lineHeight: 20 }}>
            {text.body}
          </Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text.action}
              onPress={act}
              style={({ pressed }) => [
                asym(14, 5),
                {
                  minHeight: HIT,
                  paddingHorizontal: 16,
                  justifyContent: 'center',
                  backgroundColor: brand.orange,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Txt style={{ fontFamily: fonts.bodyExtraBold, fontSize: 14 }} color={brand.navy}>
                {text.action}
              </Txt>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('nudge.later')}
              onPress={later}
              style={{ minHeight: HIT, paddingHorizontal: 12, justifyContent: 'center' }}
            >
              <Txt style={{ fontFamily: fonts.bodyBold, fontSize: 14 }} color={c.textSecondary}>
                {t('nudge.later')}
              </Txt>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}
