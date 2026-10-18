import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, findNodeHandle, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandWordmark } from '@/components/BrandWordmark';
import { Button } from '@/components/Button';
import { Icon, type IconName } from '@/components/Icon';
import { Txt } from '@/components/Txt';
import { cityAt, CITIES, hasLiveParking, type City } from '@/data/cities';
import { currentLocation } from '@/lib/location';
import { useApp } from '@/store/app';
import { asym, brand, fonts, HIT, useColors } from '@/theme';

/** The permission prompt only: the last step never waits for a GPS fix (none may come indoors). */
async function askLocationPermission(): Promise<void> {
  try {
    await Location.requestForegroundPermissionsAsync();
  } catch {
    // Denied or unavailable: search works without it.
  }
}

function Dots({ page }: { page: number }) {
  const { t } = useTranslation();
  const c = useColors();
  return (
    <View
      style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center' }}
      accessible
      accessibilityLabel={t('onboarding.a11yStep', { n: page + 1 })}
    >
      {[0, 1].map((i) => (
        <View
          key={i}
          style={{
            width: i === page ? 24 : 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: i === page ? brand.orange : c.line,
          }}
        />
      ))}
    </View>
  );
}

/** The light card of the home screen (QuickGo): white, tight bottom-left corner, soft shadow. */
const cardShadow = {
  shadowColor: brand.navy,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.07,
  shadowRadius: 10,
} as const;

/** Large tappable city card: open cities are selectable, the others are greyed with a "Yakında" badge. */
function CityCard({
  city,
  selected,
  onPress,
}: {
  city: City;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const c = useColors();
  const live = city.available && hasLiveParking(city);
  const source = city.available
    ? t(
        !hasLiveParking(city)
          ? 'onboarding.citySourceStatic'
          : city.parkingSource === 'ispark'
            ? 'onboarding.citySourceIspark'
            : 'onboarding.citySourceIzmir',
      )
    : '';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        city.available
          ? t(selected ? 'onboarding.cityA11ySelected' : 'onboarding.cityA11yRow', {
              name: city.name,
              source,
            })
          : t('onboarding.cityA11ySoon', { name: city.name })
      }
      accessibilityState={{ disabled: !city.available, selected }}
      disabled={!city.available}
      onPress={onPress}
      style={({ pressed }) => [
        asym(22, 6),
        {
          minHeight: 64,
          paddingHorizontal: 16,
          paddingVertical: 8,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          borderWidth: 2,
          borderColor: selected ? brand.orange : 'transparent',
          backgroundColor: city.available ? c.card : c.surface,
          opacity: pressed ? 0.85 : 1,
        },
        city.available && cardShadow,
      ]}
    >
      <View style={{ flex: 1, alignItems: 'flex-start', gap: 4 }}>
        <Txt
          style={{ fontFamily: fonts.display, fontSize: 20, lineHeight: 26 }}
          color={city.available ? c.text : c.textSecondary}
        >
          {city.name}
        </Txt>
        {city.available && (
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 999,
              backgroundColor: live ? brand.mintSoft : c.chipBg,
            }}
          >
            <Txt
              style={{ fontFamily: fonts.bodyExtraBold, fontSize: 12, lineHeight: 16 }}
              color={live ? brand.mintText : c.textSecondary}
            >
              {source}
            </Txt>
          </View>
        )}
      </View>
      {!city.available && (
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 999,
            backgroundColor: c.chipBg,
          }}
        >
          <Txt variant="label" color={c.textSecondary}>
            {t('city.soon')}
          </Txt>
        </View>
      )}
      {selected && (
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: brand.orange,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="check" size={20} color={brand.navy} strokeWidth={2.6} />
        </View>
      )}
    </Pressable>
  );
}

/** One short reason to allow location: a soft icon tile and a line. */
function WhyRow({
  icon,
  text,
  tile,
  fg,
}: {
  icon: IconName;
  text: string;
  tile: string;
  fg: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 }}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: tile,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={22} color={fg} strokeWidth={2.2} />
      </View>
      <Txt style={{ flex: 1, fontSize: 16, lineHeight: 23 }}>{text}</Txt>
    </View>
  );
}

export default function Onboarding() {
  const { t } = useTranslation();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const setOnboarded = useApp((s) => s.setOnboarded);
  const cityId = useApp((s) => s.city);
  const setCity = useApp((s) => s.setCity);
  const [page, setPage] = useState(0);
  // The user's own tap always wins over the location-based preselection below.
  const picked = useRef(false);
  // Only if permission is already granted (never asks): preselect the city holding the device.
  useEffect(() => {
    let alive = true;
    currentLocation(false, 3000).then((p) => {
      const found = p ? cityAt(p) : undefined;
      if (alive && found && !picked.current) setCity(found.id);
    });
    return () => {
      alive = false;
    };
  }, [setCity]);
  // After "Devam" VoiceOver focus would stay on the old button: move it to the new heading.
  const headerRef = useRef<Text>(null);
  useEffect(() => {
    if (page === 0) return;
    const id = setTimeout(() => {
      const node = headerRef.current ? findNodeHandle(headerRef.current) : null;
      if (node != null) AccessibilityInfo.setAccessibilityFocus(node);
    }, 600);
    return () => clearTimeout(id);
  }, [page]);

  const finish = () => {
    setOnboarded(true);
    router.replace('/(tabs)');
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style="dark" />
      <View
        style={{
          flex: 1,
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 16,
          paddingHorizontal: 16,
        }}
      >
        {page === 0 && (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: 14 }}
            showsVerticalScrollIndicator={false}
          >
            <Animated.View
              entering={FadeInDown.duration(400)}
              style={{ alignItems: 'center', gap: 6 }}
            >
              <BrandWordmark layout="stacked" tone="onLight" size={44} header />
              <Txt
                style={{ textAlign: 'center', fontSize: 14, lineHeight: 20, paddingHorizontal: 8 }}
                color={c.textSecondary}
              >
                {t('onboarding.tagline')}
              </Txt>
            </Animated.View>
            <Txt
              ref={headerRef}
              accessibilityRole="header"
              style={{
                fontFamily: fonts.display,
                fontSize: 32,
                lineHeight: 38,
                letterSpacing: -0.4,
              }}
            >
              {t('onboarding.cityTitle')}
            </Txt>
            <View style={{ gap: 8 }}>
              {CITIES.map((city) => (
                <CityCard
                  key={city.id}
                  city={city}
                  selected={city.available && city.id === cityId}
                  onPress={() => {
                    picked.current = true;
                    setCity(city.id);
                  }}
                />
              ))}
            </View>
          </ScrollView>
        )}

        {page === 1 && (
          <Animated.View entering={FadeInDown.duration(400)} style={{ flex: 1 }}>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: 16 }}
              showsVerticalScrollIndicator={false}
            >
              <BrandWordmark layout="inline" tone="onLight" size={26} header />
              <Txt
                ref={headerRef}
                accessibilityRole="header"
                style={{
                  fontFamily: fonts.display,
                  fontSize: 32,
                  lineHeight: 38,
                  letterSpacing: -0.4,
                }}
              >
                {t('onboarding.locTitle')}
              </Txt>
              <View
                style={[
                  asym(22, 6),
                  { backgroundColor: c.card, paddingHorizontal: 16, paddingVertical: 2 },
                  cardShadow,
                ]}
              >
                <WhyRow
                  icon="locate"
                  text={t('onboarding.locWhy1')}
                  tile={brand.mintSoft}
                  fg={brand.mintText}
                />
                <View style={{ height: 1, backgroundColor: c.line }} />
                <WhyRow
                  icon="check"
                  text={t('onboarding.locWhy2')}
                  tile={brand.peachSoft}
                  fg={brand.peachText}
                />
                <View style={{ height: 1, backgroundColor: c.line }} />
                <WhyRow
                  icon="search"
                  text={t('onboarding.locWhy3')}
                  tile={brand.mintSoft}
                  fg={brand.mintText}
                />
              </View>
              <Txt variant="caption" color={c.textSecondary} style={{ paddingHorizontal: 4 }}>
                {t('onboarding.locNote')}
              </Txt>
            </ScrollView>
          </Animated.View>
        )}

        <View style={{ gap: 14, paddingTop: 12 }}>
          <Dots page={page} />
          {page === 0 && <Button label={t('onboarding.next')} onPress={() => setPage(1)} />}
          {page === 1 && (
            <>
              <Button
                label={t('onboarding.allow')}
                onPress={async () => {
                  await askLocationPermission();
                  finish();
                }}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('onboarding.skip')}
                onPress={finish}
                style={{ minHeight: HIT, alignItems: 'center', justifyContent: 'center' }}
              >
                <Txt variant="bodyBold" color={c.textSecondary}>
                  {t('onboarding.skip')}
                </Txt>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </View>
  );
}
