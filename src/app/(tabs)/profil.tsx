import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Linking, ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Section } from '@/components/Section';
import { Txt } from '@/components/Txt';
import { activeCity, hasLiveParking } from '@/data/cities';
import { formatClock } from '@/data/freshness';
import { useParkings } from '@/data/useParkings';
import type { LangPref } from '@/i18n';
import { aiBaseUrl } from '@/lib/ai/client';
import { REPO_URL } from '@/lib/report';
import { useAi } from '@/store/ai';
import { useApp } from '@/store/app';
import { useColors, useTabBarSpace } from '@/theme';

const LANG_CHOICES: LangPref[] = ['auto', 'tr', 'en'];
/** Each language in its own words, so it can be found whatever the app shows now. */
const LANG_NAMES = { tr: 'Türkçe', en: 'English' } as const;

export default function ProfileScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const { data } = useParkings();
  const setOnboarded = useApp((s) => s.setOnboarded);
  const lang = useApp((s) => s.lang);
  const setLang = useApp((s) => s.setLang);
  const consent = useAi((s) => s.consent);
  const setConsent = useAi((s) => s.setConsent);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingHorizontal: 20,
        paddingBottom: tabSpace,
        gap: 14,
      }}
    >
      <ScreenHeader title={t('profile.title')} />
      <Txt secondary>{t('profile.noAccount')}</Txt>
      <Section title={t('profile.data')}>
        <Txt>{t('profile.dataBody')}</Txt>
        {data && data.source === 'static-only' ? (
          // Placeholder: nothing was downloaded yet. With a reason: the download failed.
          data.fallbackReason ? (
            <Txt variant="caption" secondary>
              {t('freshness.staticOnlyBanner')}
            </Txt>
          ) : !hasLiveParking(activeCity()) ? (
            <Txt variant="caption" secondary>
              {t('freshness.noLiveBanner', {
                place: activeCity().locative,
                city: activeCity().name,
              })}
            </Txt>
          ) : null
        ) : data ? (
          <Txt variant="caption" secondary>
            {t('profile.lastFetch', { time: formatClock(new Date(data.fetchedAt)) })}
            {data.offline ? ` · ${t('freshness.offline')}` : ''}
          </Txt>
        ) : null}
      </Section>
      <Section title={t('profile.language')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {LANG_CHOICES.map((l) => (
            <Chip
              key={l}
              label={l === 'auto' ? t('profile.langAuto') : LANG_NAMES[l]}
              selected={lang === l}
              onPress={() => setLang(l)}
            />
          ))}
        </View>
      </Section>
      {aiBaseUrl() ? (
        <Section title={t('chat.aiSetting')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
            <Txt style={{ flex: 1 }}>{t('chat.aiConsentBody')}</Txt>
            <Switch
              value={consent === 'yes'}
              onValueChange={(on) => setConsent(on ? 'yes' : 'no')}
              accessibilityLabel={t('chat.aiSetting')}
            />
          </View>
        </Section>
      ) : null}
      <Section title={t('profile.privacy')}>
        <Txt>{t('profile.privacyBody')}</Txt>
      </Section>
      <Section title={t('profile.licenses')}>
        <Txt>{t('profile.licensesBody')}</Txt>
      </Section>
      <Button
        kind="secondary"
        label={t('profile.github')}
        onPress={() => void Linking.openURL(REPO_URL)}
      />
      <Button
        kind="secondary"
        label={t('profile.resetOnboarding')}
        onPress={() => {
          setOnboarded(false);
          router.replace('/onboarding');
        }}
      />
    </ScrollView>
  );
}
