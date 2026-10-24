import { router } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { openFood, openFoodNearMe } from '@/components/FoodHome';
import { HandNote } from '@/components/lively/Hand';
import { buildCandidates, MEAL_RADIUS_M, useNudgeText } from '@/components/mascot/MascotNudge';
import { Txt } from '@/components/Txt';
import type { LatLng } from '@/data/geo';
import {
  formatDistance,
  matchesCategory,
  restaurantsNear,
  type FoodCategory,
} from '@/data/restaurants';
import { useParkings } from '@/data/useParkings';
import { openDirections } from '@/lib/directions';
import { cardNudge, easiestParking, roundedCount, type Nudge } from '@/lib/nudge';
import { buildRestaurantRows } from '@/lib/restaurantRows';
import { useNow } from '@/lib/useNow';
import { useApp } from '@/store/app';
import { fonts, useColors } from '@/theme';

import { CravingIcon, type CravingId } from './CravingIcon';
import { mealSlot, type MealSlot } from './cravingOrder';
import type { NearbyHome } from './useNearbyHome';

/** The craving icon that stands for a food category. */
const CAT_ICON: Record<FoodCategory, CravingId> = {
  breakfast: 'breakfast',
  soup: 'soup',
  meat: 'kebab',
  lokanta: 'chickenRice',
  fish: 'fish',
  cafe: 'coffee',
  meyhane: 'meyhane',
  fast: 'lahmacun',
  world: 'world',
  dessert: 'dessert',
};

/** What the card says, built from facts only. */
export type NoteContent =
  /** Something special (the nudge's other kinds): its own text and action. */
  | { kind: 'special'; nudge: Exclude<Nudge, { kind: 'meal' }> }
  /** The meal-time line; each fact is null when it is not known, and then left out. */
  | {
      kind: 'meal';
      slot: MealSlot;
      cat: FoodCategory | null;
      count: number | null;
      target: LatLng | null;
      easy: { name: string; distanceM: number } | null;
    };

type NoteInput = Parameters<typeof buildCandidates>[0];

/**
 * Picks the card's content with the nudge's own rules (`buildCandidates`, `cardNudge`): the most
 * urgent suggestion that fits, else the meal of the hour with the real count of matching places
 * around the user and, when known, the place with the easiest parking. Nothing is invented: with
 * no location or too few places the card keeps only the time-of-day line.
 */
export function buildNote(d: NoteInput, now: Date): NoteContent {
  const top = cardNudge(buildCandidates(d, now));
  if (top && top.kind !== 'meal') return { kind: 'special', nudge: top };
  const slot = mealSlot(now.getHours());
  if (!top || !d.here) {
    return { kind: 'meal', slot, cat: null, count: null, target: null, easy: null };
  }
  const here = d.here;
  const places = restaurantsNear(here, MEAL_RADIUS_M, 5000).filter((r) =>
    matchesCategory(r, top.cat),
  );
  const rows = buildRestaurantRows(places.slice(0, 60), d.parkings ?? [], here, now);
  return {
    kind: 'meal',
    slot,
    cat: top.cat,
    count: top.count,
    target: here,
    easy: easiestParking(rows, top.cat),
  };
}

/**
 * The taped suggestion note in the middle of Home (design 4-anasayfa-canli): a yellow card with a
 * tape strip, a hand-written title, one line of real facts and a link. It is always there and
 * follows the time of day; Yerim's peek (MascotNudge) never repeats what it says.
 */
export function SuggestionNote({ nearby }: { nearby: Pick<NearbyHome, 'here'> }) {
  const { t } = useTranslation();
  const c = useColors();
  const favorites = useApp((s) => s.favorites);
  const favoriteRestaurants = useApp((s) => s.favoriteRestaurants);
  const active = useApp((s) => s.active);
  const parkings = useParkings().data?.parkings;
  const here = nearby.here;
  // Re-read the clock every 5 minutes: the hour, and the counts' age, move on.
  const nowMs = useNow(300_000);
  const note = useMemo(
    () => buildNote({ parkings, favorites, favoriteRestaurants, active, here }, new Date(nowMs)),
    [parkings, favorites, favoriteRestaurants, active, here, nowMs],
  );
  const special = useNudgeText(note.kind === 'special' ? note.nudge : null);

  let title: string;
  let body: string;
  let action: string;
  if (special) {
    ({ title, body, action } = special);
  } else if (note.kind === 'meal' && note.cat) {
    const what = t(`nudge.cats.${note.cat}`);
    const r = roundedCount(note.count ?? 0);
    const count =
      r.key === 'few'
        ? t('nudge.meal.bodyFew', { count: r.count, what })
        : t(`nudge.meal.bodyOver${r.count}`, { what });
    title = t(`home.note.title.${note.slot}`, { dish: t(`home.note.dish.${note.cat}`) });
    body = note.easy
      ? `${count} ${t('home.note.parkEasy', {
          name: note.easy.name,
          distance: formatDistance(note.easy.distanceM),
        })}`
      : count;
    action = t(`home.note.show.${note.cat}`);
  } else {
    const slot = note.kind === 'meal' ? note.slot : mealSlot(new Date().getHours());
    title = t(`home.note.generic.${slot}`);
    body = t('home.note.bodyNone');
    action = t('home.note.actionNone');
  }

  const open = () => {
    if (note.kind === 'special') {
      const n = note.nudge;
      if (n.kind === 'favFilling')
        router.push({ pathname: '/otopark/[id]', params: { id: n.alt.id } });
      else if (n.kind === 'favNearby')
        router.push({ pathname: '/restoran/[id]', params: { id: n.place.id } });
      else void openDirections(n.station, n.station.name, 'walk');
    } else if (note.cat && note.target) {
      // The same list the nudge's action opens.
      openFood(note.target, t('results.myLocation'), note.cat);
    } else {
      void openFoodNearMe(t('results.myLocation'));
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
      accessibilityHint={action}
      onPress={open}
      style={({ pressed }) => ({
        marginHorizontal: 22,
        marginTop: 22,
        marginBottom: 6,
        paddingTop: 14,
        paddingBottom: 13,
        paddingHorizontal: 16,
        backgroundColor: c.badgeInfoBg,
        borderTopLeftRadius: 3,
        borderTopRightRadius: 3,
        borderBottomRightRadius: 3,
        borderBottomLeftRadius: 14,
        transform: [{ rotate: '-1.2deg' }, { scale: pressed ? 0.98 : 1 }],
        shadowColor: c.ink,
        shadowOpacity: 0.2,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 5 },
        elevation: 2,
      })}
    >
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -9,
          left: '50%',
          width: 70,
          height: 18,
          marginLeft: -35,
          backgroundColor: c.accent,
          opacity: 0.5,
          transform: [{ rotate: '3deg' }],
        }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: c.card,
          }}
        >
          {note.kind === 'meal' && note.cat ? (
            <CravingIcon id={CAT_ICON[note.cat]} size={20} color={c.ink} />
          ) : (
            <Icon
              name={
                note.kind === 'special' && note.nudge.kind === 'favNearby'
                  ? 'star'
                  : note.kind === 'special'
                    ? 'pin'
                    : 'cutlery'
              }
              size={18}
              color={c.ink}
              strokeWidth={2.2}
            />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <HandNote size={21} color={c.text} tilt={0}>
            {title}
          </HandNote>
          <Txt style={{ fontSize: 13, lineHeight: 18, marginTop: 3 }} secondary>
            {body}
          </Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 }}>
            <Txt
              style={{ flexShrink: 1, fontFamily: fonts.bodyExtraBold, fontSize: 13 }}
              color={c.accentStrong}
            >
              {action}
            </Txt>
            <Icon name="arrow" size={15} color={c.accentStrong} strokeWidth={2.6} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}
