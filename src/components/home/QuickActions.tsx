import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, useWindowDimensions, View } from 'react-native';

import { useCoachTarget } from '@/components/coach/registry';
import { openFoodNearMe } from '@/components/FoodHome';
import { Icon } from '@/components/Icon';
import { Txt } from '@/components/Txt';
import { LivePulse, TicketCut } from '@/components/lively/Ticket';
import { asym, fonts, useColors } from '@/theme';

import { roundedCount } from '@/lib/nudge';

import { NO_TICKET_FACTS } from './ticketFacts';
import type { NearbyHome } from './useNearbyHome';

/**
 * The two main jobs (lively design): car parks near me (soft green) and food near
 * me (soft peach), each a paper ticket. The park ticket carries the live free count of
 * the nearest car park when one is known.
 */
export function QuickActions({
  nearby,
}: {
  nearby: Pick<NearbyHome, 'nearestFree' | 'nearestWalk' | 'foodCount'> &
    Partial<Pick<NearbyHome, 'tickets'>>;
}) {
  const c = useColors();
  const { t } = useTranslation();
  const { fontScale } = useWindowDimensions();
  const [busy, setBusy] = useState(false);
  const stacked = fontScale > 1.3;
  const coachPark = useCoachTarget('park');
  const coachFood = useCoachTarget('food');

  const live = nearby.nearestFree
    ? t('home.liveLine', { count: nearby.nearestFree.free, walk: nearby.nearestFree.walk })
    : nearby.nearestWalk != null
      ? t('home.nearestWalk', { walk: nearby.nearestWalk })
      : null;

  // The middle of each ticket always carries the best fact we have, never an invented one.
  const f = nearby.tickets ?? NO_TICKET_FACTS;
  const park = nearby.nearestFree;
  let parkBig: Big | null = null;
  let parkSub: string | null = live;
  if (park?.free != null) {
    parkBig = { n: park.free, unit: t('home.ticketFree'), live: true };
    parkSub = t('home.ticketWhere', { name: park.name, walk: park.walk });
  } else if (f.parkWithin != null) {
    parkBig = { n: f.parkWithin, unit: t('home.ticketPark', { count: f.parkWithin }) };
    parkSub = f.nearestPark
      ? t('home.ticketNearest', { name: f.nearestPark.name, walk: f.nearestPark.walk })
      : t('home.foodRadius');
  } else if (f.nearestPark) {
    parkBig = { n: f.nearestPark.name, unit: '', name: true };
    parkSub = t('home.ticketWalk', { walk: f.nearestPark.walk });
  } else if (f.cityParks != null) {
    parkBig = { n: f.cityParks, unit: t('home.ticketPark', { count: f.cityParks }) };
    parkSub = t('home.ticketInCity');
  }

  let foodBig: Big | null = null;
  let foodSub: string | null = null;
  if (f.foodOpenNow != null) {
    foodBig = { n: f.foodOpenNow, unit: t('home.ticketOpen', { count: f.foodOpenNow }) };
    foodSub = t('home.foodRadius');
  } else if (f.foodWithin != null) {
    foodBig = { n: f.foodWithin, unit: t('home.ticketRestaurant', { count: f.foodWithin }) };
    foodSub = t('home.ticketNearby');
  } else if (f.mealNear) {
    const r = roundedCount(f.mealNear.count);
    foodBig = {
      n: r.key === 'few' ? r.count : `${r.count}+`,
      unit: t(`nudge.cats.${f.mealNear.cat}`),
    };
    foodSub = t('home.ticketNearby');
  } else if (nearby.foodCount != null) {
    foodBig = { n: nearby.foodCount, unit: t('home.ticketFood', { count: nearby.foodCount }) };
    foodSub = t('home.foodRadius');
  } else if (f.cityFood != null) {
    foodBig = { n: f.cityFood, unit: t('home.ticketRestaurant', { count: f.cityFood }) };
    foodSub = t('home.ticketInCity');
  }
  // Read aloud: the same fact as on the ticket, with no mention of parking on the food one.
  const foodSpoken =
    nearby.foodCount != null && f.foodOpenNow == null && f.foodWithin == null && !f.mealNear
      ? t('home.foodPlacesCount', { count: nearby.foodCount })
      : foodBig
        ? `${foodBig.n} ${foodBig.unit}, ${foodSub}`
        : t('home.foodPlaces');
  const parkSpoken =
    live && park ? live : parkBig ? `${parkBig.n} ${parkBig.unit}, ${parkSub}` : live;

  const openFood = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await openFoodNearMe(t('results.myLocation'), undefined, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      style={{
        flexDirection: stacked ? 'column' : 'row',
        gap: 10,
        paddingHorizontal: 16,
        paddingTop: 16,
      }}
    >
      <ActionCard
        coach={coachPark}
        bg={c.mintSoft}
        fg={c.mintText}
        mark={
          <Txt
            allowFontScaling={false}
            style={{ fontFamily: fonts.display, fontSize: 19, lineHeight: 23 }}
            color={c.mintText}
          >
            P
          </Txt>
        }
        title={t('home.parkNearMe')}
        big={parkBig}
        sub={parkSub}
        label={parkSpoken ? `${t('home.a11yParkNearMe')}, ${parkSpoken}` : t('home.a11yParkNearMe')}
        stacked={stacked}
        onPress={() => router.push({ pathname: '/sonuc', params: { near: '1' } })}
      />
      <ActionCard
        coach={coachFood}
        bg={c.peachSoft}
        fg={c.peachText}
        mark={
          busy ? (
            <ActivityIndicator size="small" color={c.ink} />
          ) : (
            <Icon name="cutlery" size={18} color={c.ink} strokeWidth={2.3} />
          )
        }
        title={t('home.foodNearMe')}
        big={foodBig}
        sub={foodSub ?? t('home.foodPlaces')}
        label={`${t('home.a11yFoodNearMe')}, ${foodSpoken}`}
        busy={busy}
        stacked={stacked}
        onPress={() => void openFood()}
      />
    </View>
  );
}

/** The big fact in the middle of a ticket; `name` is a car park name (smaller type, no unit). */
type Big = { n: number | string; unit: string; live?: boolean; name?: boolean };

/**
 * One job card as a paper ticket (lively design): mark and title above the tear line, a big
 * number below it when there is one (with a breathing dot when it is live), the small line and
 * an arrow.
 */
function ActionCard({
  coach,
  bg,
  fg,
  mark,
  title,
  big,
  sub,
  label,
  busy,
  stacked,
  onPress,
}: {
  coach: ReturnType<typeof useCoachTarget>;
  bg: string;
  fg: string;
  mark: React.ReactNode;
  title: string;
  big: Big | null;
  sub: string | null;
  label: string;
  busy?: boolean;
  stacked: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  // The tear line sits just under the title, however tall large text makes it.
  const [cut, setCut] = useState(52);
  return (
    <Pressable
      {...coach}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={busy != null ? { busy } : undefined}
      onPress={onPress}
      style={({ pressed }) => [
        asym(20, 6),
        {
          flex: stacked ? undefined : 1,
          minHeight: 132,
          padding: 14,
          paddingBottom: 12,
          justifyContent: 'space-between',
          backgroundColor: bg,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      <TicketCut top={cut} color={fg} />
      <View
        onLayout={(e) =>
          setCut(Math.round(e.nativeEvent.layout.y + e.nativeEvent.layout.height + 8))
        }
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
      >
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 9,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: c.card,
          }}
        >
          {mark}
        </View>
        <Txt
          numberOfLines={2}
          style={{ flex: 1, fontFamily: fonts.bodyExtraBold, fontSize: 17, lineHeight: 22 }}
        >
          {title}
        </Txt>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 18 }}>
        <View style={{ flex: 1 }}>
          {big && (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
              {big.live && (
                <View style={{ alignSelf: 'center' }}>
                  <LivePulse color={fg} />
                </View>
              )}
              <Txt
                numberOfLines={big.name ? 2 : undefined}
                style={
                  big.name
                    ? { flexShrink: 1, fontFamily: fonts.display, fontSize: 18, lineHeight: 22 }
                    : { fontFamily: fonts.display, fontSize: 28, lineHeight: 32 }
                }
                color={fg}
              >
                {big.n}
              </Txt>
              {big.unit ? (
                <Txt
                  style={{ flexShrink: 1, fontFamily: fonts.bodyExtraBold, fontSize: 13 }}
                  color={fg}
                >
                  {big.unit}
                </Txt>
              ) : null}
            </View>
          )}
          {sub ? (
            <Txt
              numberOfLines={2}
              style={{ fontFamily: fonts.bodyBold, fontSize: 12, lineHeight: 16, marginTop: 2 }}
              color={fg}
            >
              {sub}
            </Txt>
          ) : null}
        </View>
        <Icon name="arrow" size={20} color={c.ink} strokeWidth={2.2} />
      </View>
    </Pressable>
  );
}
