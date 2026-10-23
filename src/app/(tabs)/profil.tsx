import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { Linking, ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { Button } from '@/components/Button';
import { Icon, type IconName } from '@/components/Icon';
import { MascotFace } from '@/components/mascot/Mascot';
import { TabHint } from '@/components/mascot/TabHint';
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
import { useCoach } from '@/store/coach';
import { THEME_PREFS, useAppearance } from '@/store/appearance';
import { useNudge } from '@/store/nudge';
import { useApp } from '@/store/app';
import { brand, fonts, useColors, useTabBarSpace } from '@/theme';

const LANG_CHOICES: LangPref[] = ['auto', 'tr', 'en'];
/** Each language in its own words, so it can be found whatever the app shows now. */
const LANG_NAMES = { tr: 'Türkçe', en: 'English' } as const;

/** Settings card in the home look: white block, peach edge, round icon tile and a title. */
function Card({
  icon,
  glyph,
  tint,
  title,
  children,
}: {
  icon?: IconName;
  /** Drawn in the tile instead of an icon. */
  glyph?: ReactNode;
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
        borderColor: c.peachLine,
        backgroundColor: c.card,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Tile bg={tint}>
          {glyph ?? (icon && <Icon name={icon} size={20} color={c.ink} strokeWidth={2.2} />)}
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
      bg={selected ? c.peachSoft : c.surface}
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
  const nudges = useNudge((s) => s.enabled);
  const theme = useAppearance((s) => s.theme);
  const setTheme = useAppearance((s) => s.setTheme);

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
      <TabHint tab="profil" />
      <Txt secondary>{t('profile.noAccount')}</Txt>
      {aiBaseUrl() ? (
        <Card icon="sparkle" tint={c.peachSoft} title={t('chat.aiSetting')}>
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
      <Card glyph={<MascotFace size={24} />} tint={brand.orange} title={t('profile.yerim')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt>{t('profile.nudges')}</Txt>
            <Txt variant="caption" secondary>
              {t('profile.nudgesBody')}
            </Txt>
          </View>
          <Switch
            value={nudges}
            onValueChange={(on) => useNudge.getState().setEnabled(on)}
            accessibilityLabel={t('profile.nudges')}
          />
        </View>
      </Card>
      <Card
        glyph={
          // Half light, half dark: the look.
          <Svg width={20} height={20} viewBox="0 0 24 24">
            <Circle cx={12} cy={12} r={8} fill="none" stroke={c.ink} strokeWidth={2.2} />
            <Path d="M12 4a8 8 0 0 1 0 16z" fill={c.ink} />
          </Svg>
        }
        tint={c.surface}
        title={t('profile.theme')}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {THEME_PREFS.map((p) => (
            <Choice
              key={p}
              label={t(`profile.theme_${p}`)}
              selected={theme === p}
              onPress={() => setTheme(p)}
            />
          ))}
        </View>
      </Card>
      <Card icon="globe" tint={c.mintSoft} title={t('profile.language')}>
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
      <Card icon="map" tint={c.mintSoft} title={t('profile.mapApp')}>
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
          // The welcome, Yerim's tour and the first-visit hints all play again.
          useCoach.getState().reset();
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
