import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, useWindowDimensions, View } from 'react-native';

import { openFoodNearMe } from '@/components/FoodHome';
import { Icon } from '@/components/Icon';
import { Txt } from '@/components/Txt';
import { brand, fonts, useColors } from '@/theme';

import type { NearbyHome } from './useNearbyHome';

/**
 * The two main jobs: car parks near me (navy) and food near me (orange).
 * The park button carries a small live line when the nearest car park with a
 * fresh free count is known.
 */
export function QuickActions({
  nearby,
}: {
  nearby: Pick<NearbyHome, 'nearestFree' | 'nearestWalk'>;
}) {
  const c = useColors();
  const { t } = useTranslation();
  const { fontScale } = useWindowDimensions();
  const [busy, setBusy] = useState(false);
  const stacked = fontScale > 1.3;

  const live = nearby.nearestFree
    ? t('home.liveLine', { count: nearby.nearestFree.free, walk: nearby.nearestFree.walk })
    : nearby.nearestWalk != null
      ? t('home.nearestWalk', { walk: nearby.nearestWalk })
      : null;

  const openFood = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await openFoodNearMe(t('results.myLocation'), undefined, true);
    } finally {
      setBusy(false);
    }
  };

  const base = {
    flex: stacked ? undefined : 1,
    minHeight: 84,
    borderRadius: 20,
    padding: 12,
    gap: 10,
    justifyContent: 'space-between',
  } as const;

  return (
    <View
      style={{
        flexDirection: stacked ? 'column' : 'row',
        gap: 10,
        paddingHorizontal: 16,
        paddingTop: 12,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={live ? `${t('home.parkNearMe')}, ${live}` : t('home.parkNearMe')}
        onPress={() => router.push({ pathname: '/sonuc', params: { near: '1' } })}
        style={[base, { backgroundColor: brand.navy }]}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: c.accent,
            }}
          >
            <Txt
              allowFontScaling={false}
              style={{ fontFamily: fonts.display, fontSize: 17, lineHeight: 22 }}
              color={brand.navy}
            >
              P
            </Txt>
          </View>
          {live && (
            <Txt
              numberOfLines={2}
              style={{
                flexShrink: 1,
                textAlign: 'right',
                fontFamily: fonts.bodyExtraBold,
                fontSize: 12,
                lineHeight: 16,
              }}
              color={brand.mint}
            >
              {live}
            </Txt>
          )}
        </View>
        <Txt
          style={{ fontFamily: fonts.bodyExtraBold, fontSize: 15, lineHeight: 20 }}
          color={brand.white}
        >
          {t('home.parkNearMe')}
        </Txt>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('home.foodNearMe')}, ${t('home.foodEasy')}`}
        accessibilityState={{ busy }}
        onPress={() => void openFood()}
        style={[base, { backgroundColor: c.accent }]}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: brand.navy,
            }}
          >
            {busy ? (
              <ActivityIndicator size="small" color={brand.white} />
            ) : (
              <Icon name="cutlery" size={18} color={brand.white} strokeWidth={2.3} />
            )}
          </View>
          <Txt
            numberOfLines={2}
            style={{
              flexShrink: 1,
              textAlign: 'right',
              fontFamily: fonts.bodyExtraBold,
              fontSize: 12,
              lineHeight: 16,
            }}
            color={brand.brown}
          >
            {t('home.foodEasy')}
          </Txt>
        </View>
        <Txt
          style={{ fontFamily: fonts.bodyExtraBold, fontSize: 15, lineHeight: 20 }}
          color={brand.navy}
        >
          {t('home.foodNearMe')}
        </Txt>
      </Pressable>
    </View>
  );
}
