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

import type { NearbyHome } from './useNearbyHome';

/**
 * The two main jobs (lively design): car parks near me (soft green) and food near
 * me (soft peach), each a paper ticket. The park ticket carries the live free count of
 * the nearest car park when one is known.
 */
export function QuickActions({
  nearby,
}: {
  nearby: Pick<NearbyHome, 'nearestFree' | 'nearestWalk' | 'foodCount'>;
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

  // Never about parking: the food job stands on its own.
  const foodSub =
    nearby.foodCount != null
      ? t('home.foodPlacesCount', { count: nearby.foodCount })
      : t('home.foodPlaces');

  const openFood = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await openFoodNearMe(t('results.myLocation'), undefined, true);
    } finally {
      setBusy(false);
    }
  };

  const park = nearby.nearestFree;
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
        big={park?.free != null ? { n: park.free, unit: t('home.ticketFree'), live: true } : null}
        sub={park ? t('home.ticketWhere', { name: park.name, walk: park.walk }) : live}
        label={live ? `${t('home.a11yParkNearMe')}, ${live}` : t('home.a11yParkNearMe')}
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
        big={
          nearby.foodCount != null
            ? { n: nearby.foodCount, unit: t('home.ticketFood', { count: nearby.foodCount }) }
            : null
        }
        sub={nearby.foodCount != null ? t('home.foodRadius') : foodSub}
        label={`${t('home.a11yFoodNearMe')}, ${foodSub}`}
        busy={busy}
        stacked={stacked}
        onPress={() => void openFood()}
      />
    </View>
  );
}

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
  big: { n: number; unit: string; live?: boolean } | null;
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
              <Txt style={{ fontFamily: fonts.display, fontSize: 28, lineHeight: 32 }} color={fg}>
                {big.n}
              </Txt>
              <Txt
                style={{ flexShrink: 1, fontFamily: fonts.bodyExtraBold, fontSize: 13 }}
                color={fg}
              >
                {big.unit}
              </Txt>
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
