import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Linking, ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Section } from '@/components/Section';
import { Txt } from '@/components/Txt';
import { formatClock } from '@/data/freshness';
import { useParkings } from '@/data/useParkings';
import { aiBaseUrl } from '@/lib/ai/client';
import { REPO_URL } from '@/lib/report';
import { useAi } from '@/store/ai';
import { useApp } from '@/store/app';
import { useColors } from '@/theme';

export default function ProfileScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { data } = useParkings();
  const setOnboarded = useApp((s) => s.setOnboarded);
  const consent = useAi((s) => s.consent);
  const setConsent = useAi((s) => s.setConsent);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingHorizontal: 20,
        paddingBottom: 32,
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
          ) : null
        ) : data ? (
          <Txt variant="caption" secondary>
            {t('profile.lastFetch', { time: formatClock(new Date(data.fetchedAt)) })}
            {data.offline ? ` · ${t('freshness.offline')}` : ''}
          </Txt>
        ) : null}
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
