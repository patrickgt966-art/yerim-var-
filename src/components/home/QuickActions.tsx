import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, useWindowDimensions, View } from 'react-native';

import { openFoodNearMe } from '@/components/FoodHome';
import { Icon } from '@/components/Icon';
import { Txt } from '@/components/Txt';
import { brand, fonts } from '@/theme';

import type { NearbyHome } from './useNearbyHome';

/**
 * The two main jobs (design V5): car parks near me (soft green) and food near
 * me (soft peach). The park card carries a small live line when the nearest
 * car park with a fresh free count is known.
 */
export function QuickActions({
  nearby,
}: {
  nearby: Pick<NearbyHome, 'nearestFree' | 'nearestWalk' | 'foodCount'>;
}) {
  const { t } = useTranslation();
  const { fontScale } = useWindowDimensions();
  const [busy, setBusy] = useState(false);
  const stacked = fontScale > 1.3;

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

  return (
    <View
      style={{
        flexDirection: stacked ? 'column' : 'row',
        gap: 10,
        paddingHorizontal: 16,
        paddingTop: 14,
      }}
    >
      <ActionCard
        bg={brand.mintSoft}
        fg={brand.mintText}
        mark={
          <Txt
            allowFontScaling={false}
            style={{ fontFamily: fonts.display, fontSize: 22, lineHeight: 26 }}
          >
            P
          </Txt>
        }
        title={t('home.parkNearMe')}
        sub={live}
        label={live ? `${t('home.a11yParkNearMe')}, ${live}` : t('home.a11yParkNearMe')}
        stacked={stacked}
        onPress={() => router.push({ pathname: '/sonuc', params: { near: '1' } })}
      />
      <ActionCard
        bg={brand.peachSoft}
        fg={brand.peachText}
        mark={
          busy ? (
            <ActivityIndicator size="small" color={brand.navy} />
          ) : (
            <Icon name="cutlery" size={24} color={brand.navy} strokeWidth={2.2} />
          )
        }
        title={t('home.foodNearMe')}
        sub={foodSub}
        label={`${t('home.a11yFoodNearMe')}, ${foodSub}`}
        busy={busy}
        stacked={stacked}
        onPress={() => void openFood()}
      />
    </View>
  );
}

/** One soft card: mark and title on top, the small line and an arrow below. */
function ActionCard({
  bg,
  fg,
  mark,
  title,
  sub,
  label,
  busy,
  stacked,
  onPress,
}: {
  bg: string;
  fg: string;
  mark: React.ReactNode;
  title: string;
  sub: string | null;
  label: string;
  busy?: boolean;
  stacked: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={busy != null ? { busy } : undefined}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: stacked ? undefined : 1,
        minHeight: 92,
        borderRadius: 20,
        padding: 14,
        gap: 10,
        justifyContent: 'space-between',
        backgroundColor: bg,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ minWidth: 24, alignItems: 'center' }}>{mark}</View>
        <Txt
          numberOfLines={2}
          style={{ flex: 1, fontFamily: fonts.bodyExtraBold, fontSize: 17, lineHeight: 22 }}
        >
          {title}
        </Txt>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Txt
          numberOfLines={2}
          style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 13, lineHeight: 17 }}
          color={fg}
        >
          {sub ?? ''}
        </Txt>
        <Icon name="arrow" size={20} color={brand.navy} strokeWidth={2.2} />
      </View>
    </Pressable>
  );
}
