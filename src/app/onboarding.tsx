import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, findNodeHandle, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandWordmark } from '@/components/BrandWordmark';
import { DashedFrame } from '@/components/DashedFrame';
import { Icon, type IconName } from '@/components/Icon';
import { OnboardingBackdrop } from '@/components/OnboardingBackdrop';
import { PBadge } from '@/components/PBadge';
import { Txt } from '@/components/Txt';
import { cityAt, CITIES, hasLiveParking, type City } from '@/data/cities';
import { currentLocation } from '@/lib/location';
import { useApp } from '@/store/app';
import { asym, brand, fonts, HIT } from '@/theme';

/** The permission prompt only: the last step never waits for a GPS fix (none may come indoors). */
async function askLocationPermission(): Promise<void> {
  try {
    await Location.requestForegroundPermissionsAsync();
  } catch {
    // Denied or unavailable: search works without it.
  }
}

function Rings({ size }: { size: number }) {
  const reduce = useReducedMotion();
  const s = useSharedValue(0);
  useEffect(() => {
    if (!reduce)
      s.value = withRepeat(
        withTiming(1, { duration: 5000, easing: Easing.out(Easing.ease) }),
        -1,
        false,
      );
  }, [reduce, s]);
  const ring = useAnimatedStyle(() => ({
    opacity: 0.5 * (1 - s.value),
    transform: [{ scale: 0.7 + 1.4 * s.value }],
  }));
  return (
    <>
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.35)',
        }}
      />
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.5)',
          },
          ring,
        ]}
      />
    </>
  );
}

function Dots({ page }: { page: number }) {
  const { t } = useTranslation();
  return (
    <View
      style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}
      accessible
      accessibilityLabel={t('onboarding.a11yStep', { n: page + 1 })}
    >
      {[0, 1].map((i) => (
        <View
          key={i}
          style={{
            width: 12,
            height: 22,
            borderRadius: 4,
            ...(i === page
              ? { backgroundColor: brand.orange }
              : { borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.6)' }),
          }}
        />
      ))}
    </View>
  );
}

function CTA({ label, onPress, a11y }: { label: string; onPress: () => void; a11y?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      onPress={onPress}
      style={({ pressed }) => [
        asym(34, 10),
        {
          minHeight: 64,
          backgroundColor: '#FFFFFF',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <Txt style={{ fontFamily: fonts.display, fontSize: 20 }} color={brand.navy}>
        {label}
      </Txt>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: brand.orange,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="arrow" size={20} color={brand.navy} strokeWidth={2.4} />
      </View>
    </Pressable>
  );
}

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
        asym(26, 8),
        {
          minHeight: 72,
          paddingHorizontal: 18,
          paddingVertical: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          borderWidth: 2,
          borderColor: selected ? brand.orange : 'transparent',
          backgroundColor: !city.available
            ? 'rgba(255,255,255,0.08)'
            : selected
              ? '#FFFFFF'
              : 'rgba(255,255,255,0.92)',
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Txt
          style={{ fontFamily: fonts.display, fontSize: 22 }}
          color={city.available ? brand.navy : 'rgba(255,255,255,0.75)'}
        >
          {city.name}
        </Txt>
        {city.available && (
          <Txt variant="caption" color={brand.textSecondary}>
            {source}
          </Txt>
        )}
      </View>
      {!city.available && (
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 999,
            backgroundColor: 'rgba(255,255,255,0.18)',
          }}
        >
          <Txt variant="label" color="#FFFFFF">
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

/** One short reason to allow location: a small icon and a line. */
function WhyRow({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          asym(14, 5),
          {
            width: 40,
            height: 40,
            backgroundColor: 'rgba(255,255,255,0.12)',
            alignItems: 'center',
            justifyContent: 'center',
          },
        ]}
      >
        <Icon name={icon} size={22} color={brand.orange} strokeWidth={2.2} />
      </View>
      <Txt style={{ flex: 1, fontSize: 17, lineHeight: 24 }} color="rgba(255,255,255,0.9)">
        {text}
      </Txt>
    </View>
  );
}

export default function Onboarding() {
  const { t } = useTranslation();
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
    <View style={{ flex: 1, backgroundColor: brand.navy }}>
      <StatusBar style="light" />
      <OnboardingBackdrop />
      <View
        style={{
          flex: 1,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 16,
          paddingHorizontal: 32,
        }}
      >
        {page === 0 && (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: 16 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={{ alignItems: 'center', gap: 12 }}>
              <View
                style={{ width: 160, height: 160, alignItems: 'center', justifyContent: 'center' }}
              >
                <Rings size={160} />
                {/* Food + parking: orange fork-and-knife tile with a white P badge on its corner. */}
                <Animated.View
                  entering={FadeInDown.delay(300).duration(1200)}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={{ width: 100, height: 100 }}
                >
                  <View
                    style={[
                      asym(29, 8),
                      {
                        width: 100,
                        height: 100,
                        backgroundColor: brand.orange,
                        alignItems: 'center',
                        justifyContent: 'center',
                      },
                    ]}
                  >
                    <Icon name="cutlery" size={62} color={brand.navy} strokeWidth={2} />
                  </View>
                  <View
                    style={{
                      position: 'absolute',
                      right: -16,
                      bottom: -16,
                      shadowColor: brand.navy,
                      shadowOpacity: 0.35,
                      shadowRadius: 6,
                      shadowOffset: { width: 0, height: 3 },
                    }}
                  >
                    <PBadge size={44} inverted />
                  </View>
                </Animated.View>
              </View>
              <Animated.View entering={FadeInDown.delay(900).duration(800)}>
                <BrandWordmark layout="stacked" tone="onDark" size={40} header />
              </Animated.View>
              <Animated.View entering={FadeInDown.delay(1100).duration(800)}>
                <Txt
                  style={{ textAlign: 'center', fontSize: 16, lineHeight: 23 }}
                  color="rgba(255,255,255,0.85)"
                >
                  {t('onboarding.tagline')}
                </Txt>
              </Animated.View>
            </View>
            <Txt
              ref={headerRef}
              variant="display"
              color="#FFFFFF"
              accessibilityRole="header"
              style={{ marginTop: 8 }}
            >
              {t('onboarding.cityTitle')}
            </Txt>
            <View style={{ gap: 12 }}>
              {CITIES.map((c) => (
                <CityCard
                  key={c.id}
                  city={c}
                  selected={c.available && c.id === cityId}
                  onPress={() => {
                    picked.current = true;
                    setCity(c.id);
                  }}
                />
              ))}
            </View>
          </ScrollView>
        )}

        {page === 1 && (
          <Animated.View entering={FadeInDown.duration(500)} style={{ flex: 1 }}>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: 20 }}
              showsVerticalScrollIndicator={false}
            >
              {/* A parking slot with a location pin in it: the brand motif, decorative only. */}
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{ alignItems: 'center' }}
              >
                <View
                  style={{
                    width: 132,
                    height: 150,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <DashedFrame color={brand.orange} radius={34} tight={10} strokeWidth={2.5} />
                  <Icon name="pin" size={64} color={brand.orange} strokeWidth={2} />
                </View>
              </View>
              <Txt ref={headerRef} variant="display" color="#FFFFFF" accessibilityRole="header">
                {t('onboarding.locTitle')}
              </Txt>
              <View style={{ gap: 14 }}>
                <WhyRow icon="locate" text={t('onboarding.locWhy1')} />
                <WhyRow icon="check" text={t('onboarding.locWhy2')} />
                <WhyRow icon="search" text={t('onboarding.locWhy3')} />
              </View>
              <Txt variant="caption" color="rgba(255,255,255,0.7)">
                {t('onboarding.locNote')}
              </Txt>
            </ScrollView>
          </Animated.View>
        )}

        <View style={{ gap: 20 }}>
          <Dots page={page} />
          {page === 0 && <CTA label={t('onboarding.next')} onPress={() => setPage(1)} />}
          {page === 1 && (
            <>
              <CTA
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
                <Txt variant="bodyBold" color="#FFFFFF">
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
