import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { Linking, ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Icon, type IconName } from '@/components/Icon';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SuggestionChip, Tile } from '@/components/search/SearchBits';
import { Txt } from '@/components/Txt';
import { activeCity, hasLiveParking } from '@/data/cities';
import { formatClock } from '@/data/freshness';
import { MAP_APPS } from '@/data/mapApps';
import { useParkings } from '@/data/useParkings';
import type { LangPref } from '@/i18n';
import { aiBaseUrl } from '@/lib/ai/client';
import { REPO_URL } from '@/lib/report';
import { useAi } from '@/store/ai';
import { useApp } from '@/store/app';
import { brand, fonts, useColors, useTabBarSpace } from '@/theme';

const LANG_CHOICES: LangPref[] = ['auto', 'tr', 'en'];
/** Each language in its own words, so it can be found whatever the app shows now. */
const LANG_NAMES = { tr: 'Türkçe', en: 'English' } as const;

/** Settings card in the home look: white block, peach edge, round icon tile and a title. */
function Card({
  icon,
  tint,
  title,
  children,
}: {
  icon: IconName;
  tint: string;
  title: string;
  children: ReactNode;
}) {
  const c = useColors();
  return (
    <View
      style={{
        padding: 16,
        gap: 12,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: brand.peachLine,
        backgroundColor: c.card,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Tile bg={tint}>
          <Icon name={icon} size={20} color={brand.navy} strokeWidth={2.2} />
        </Tile>
        <Txt
          accessibilityRole="header"
          style={{ flex: 1, fontFamily: fonts.bodyExtraBold, fontSize: 17, lineHeight: 22 }}
        >
          {title}
        </Txt>
      </View>
      {children}
    </View>
  );
}

/** One choice among several, as the chat and search chips: soft fill, outlined when chosen. */
function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <SuggestionChip
      label={label}
      bg={selected ? brand.peachSoft : c.surface}
      selected={selected}
      onPress={onPress}
    />
  );
}

export default function ProfileScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const { data } = useParkings();
  const setOnboarded = useApp((s) => s.setOnboarded);
  const lang = useApp((s) => s.lang);
  const setLang = useApp((s) => s.setLang);
  const mapApp = useApp((s) => s.mapApp);
  const setMapApp = useApp((s) => s.setMapApp);
  const consent = useAi((s) => s.consent);
  const setConsent = useAi((s) => s.setConsent);
  const left = useAi((s) => s.remaining());

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingHorizontal: 16,
        paddingBottom: tabSpace,
        gap: 12,
      }}
    >
      <ScreenHeader title={t('profile.title')} />
      <Txt secondary>{t('profile.noAccount')}</Txt>
      {aiBaseUrl() ? (
        <Card icon="sparkle" tint={brand.peachSoft} title={t('chat.aiSetting')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
            <Txt style={{ flex: 1 }}>{t('chat.aiConsentBody')}</Txt>
            <Switch
              value={consent === 'yes'}
              onValueChange={(on) => setConsent(on ? 'yes' : 'no')}
              accessibilityLabel={t('chat.aiSetting')}
            />
          </View>
          {consent === 'yes' ? (
            <Txt variant="caption" secondary>
              {t('chat.a11yAiLeft', { count: left })}
            </Txt>
          ) : null}
        </Card>
      ) : null}
      <Card icon="globe" tint={brand.mintSoft} title={t('profile.language')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {LANG_CHOICES.map((l) => (
            <Choice
              key={l}
              label={l === 'auto' ? t('profile.langAuto') : LANG_NAMES[l]}
              selected={lang === l}
              onPress={() => setLang(l)}
            />
          ))}
        </View>
      </Card>
      <Card icon="map" tint={brand.mintSoft} title={t('profile.mapApp')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Choice
            label={t('profile.mapAppAsk')}
            selected={mapApp === null}
            onPress={() => setMapApp(null)}
          />
          {MAP_APPS.map((a) => (
            <Choice
              key={a}
              label={t(`directions.apps.${a}`)}
              selected={mapApp === a}
              onPress={() => setMapApp(a)}
            />
          ))}
        </View>
      </Card>
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
      <Card icon="user" tint={c.surface} title={t('profile.privacy')}>
        <Txt>{t('profile.privacyBody')}</Txt>
      </Card>
      <Card icon="pin" tint={c.surface} title={t('profile.data')}>
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
        <Txt variant="caption" secondary>
          {t('profile.licensesBody')}
        </Txt>
      </Card>
    </ScrollView>
  );
}
