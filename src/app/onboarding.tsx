import { StatusBar } from 'expo-status-bar';
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

import { CarMark } from '@/components/CarMark';
import { Icon } from '@/components/Icon';
import { OnboardingBackdrop } from '@/components/OnboardingBackdrop';
import { Txt } from '@/components/Txt';
import { currentLocation } from '@/lib/location';
import { useApp } from '@/store/app';
import { asym, brand, fonts, HIT } from '@/theme';

function Rings() {
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
          width: 260,
          height: 260,
          borderRadius: 130,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.35)',
        }}
      />
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: 260,
            height: 260,
            borderRadius: 130,
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
      {[0, 1, 2].map((i) => (
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

export default function Onboarding() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const setOnboarded = useApp((s) => s.setOnboarded);
  const [page, setPage] = useState(0);
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
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
            <Animated.View entering={FadeInDown.delay(200).duration(600)}>
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={[
                  asym(18, 6),
                  {
                    width: 64,
                    height: 64,
                    backgroundColor: '#FFFFFF',
                    borderWidth: 4,
                    borderColor: brand.orange,
                    alignItems: 'center',
                    justifyContent: 'center',
                  },
                ]}
              >
                <Txt
                  allowFontScaling={false}
                  style={{ fontFamily: fonts.display, fontSize: 38, lineHeight: 44 }}
                  color={brand.navy}
                >
                  P
                </Txt>
              </View>
            </Animated.View>
            <View
              style={{ width: 280, height: 280, alignItems: 'center', justifyContent: 'center' }}
            >
              <Rings />
              <Animated.View entering={FadeInDown.delay(300).duration(1200)}>
                <CarMark size={200} />
              </Animated.View>
            </View>
            <Animated.View
              entering={FadeInDown.delay(900).duration(800)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
              accessible
              accessibilityRole="header"
              accessibilityLabel={t('brand.a11yTitle')}
            >
              <Txt
                allowFontScaling={false}
                style={{ fontFamily: fonts.display, fontSize: 56, lineHeight: 62 }}
                color="#FFFFFF"
              >
                yerim
              </Txt>
              <View
                style={[
                  asym(12, 4),
                  {
                    backgroundColor: brand.orange,
                    paddingHorizontal: 12,
                    transform: [{ rotate: '-5deg' }],
                  },
                ]}
              >
                <Txt
                  allowFontScaling={false}
                  style={{ fontFamily: fonts.display, fontSize: 40, lineHeight: 50 }}
                  color={brand.navy}
                >
                  var!
                </Txt>
              </View>
            </Animated.View>
            <Animated.View entering={FadeInDown.delay(1100).duration(800)}>
              <Txt
                style={{ textAlign: 'center', fontSize: 18, lineHeight: 26 }}
                color="rgba(255,255,255,0.85)"
              >
                {t('onboarding.tagline')}
              </Txt>
            </Animated.View>
          </View>
        )}

        {page === 1 && (
          <Animated.View entering={FadeInDown.duration(500)} style={{ flex: 1 }}>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: 16 }}
            >
              <Txt ref={headerRef} variant="display" color="#FFFFFF" accessibilityRole="header">
                {t('onboarding.howTitle')}
              </Txt>
              <Txt style={{ fontSize: 18, lineHeight: 27 }} color="rgba(255,255,255,0.85)">
                {t('onboarding.howBody')}
              </Txt>
            </ScrollView>
          </Animated.View>
        )}

        {page === 2 && (
          <Animated.View entering={FadeInDown.duration(500)} style={{ flex: 1 }}>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: 16 }}
            >
              <Txt ref={headerRef} variant="display" color="#FFFFFF" accessibilityRole="header">
                {t('onboarding.locTitle')}
              </Txt>
              <Txt style={{ fontSize: 18, lineHeight: 27 }} color="rgba(255,255,255,0.85)">
                {t('onboarding.locBody')}
              </Txt>
            </ScrollView>
          </Animated.View>
        )}

        <View style={{ gap: 20 }}>
          <Dots page={page} />
          {page === 0 && (
            <CTA
              label={t('onboarding.start')}
              a11y={t('onboarding.a11yStart')}
              onPress={() => setPage(1)}
            />
          )}
          {page === 1 && <CTA label={t('onboarding.next')} onPress={() => setPage(2)} />}
          {page === 2 && (
            <>
              <CTA
                label={t('onboarding.allow')}
                onPress={async () => {
                  await currentLocation(true);
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
