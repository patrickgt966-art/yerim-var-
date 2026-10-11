import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { openFoodNearMe } from '@/components/FoodHome';
import { Icon, type IconName } from '@/components/Icon';
import { Txt } from '@/components/Txt';
import type { LatLng } from '@/data/geo';
import { POPULAR_PLACES } from '@/data/places';
import { pickerParams } from '@/lib/pickPlace';
import { useApp } from '@/store/app';
import { fonts, HIT, useColors } from '@/theme';

import { ChipWrap, Group, Row, SectionTitle, SuggestionChip, Tile } from './SearchBits';

export type SearchSection = 'park' | 'food';

/** Recent searches shown on the empty screen. */
export const RECENT_SHOWN = 6;

const EXAMPLE_KEYS = ['example1', 'example2', 'example3', 'example4'] as const;

function ShortcutTile({
  icon,
  label,
  a11yLabel,
  a11yHint,
  busy,
  onPress,
  onLongPress,
}: {
  icon: IconName;
  label: string;
  a11yLabel: string;
  a11yHint?: string;
  busy?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint={a11yHint}
      accessibilityState={{ busy: !!busy }}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 72,
        borderRadius: 18,
        gap: 6,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? c.surface : c.card,
      })}
    >
      {busy ? <ActivityIndicator color={c.text} /> : <Icon name={icon} size={22} color={c.text} />}
      <Txt style={{ fontFamily: fonts.bodyBold, fontSize: 12, lineHeight: 16 }}>{label}</Txt>
    </Pressable>
  );
}

/** Ev / İş: a saved place opens its results, an empty one opens the address search to set it. */
function SavedTile({ kind, onPlace }: { kind: 'home' | 'work'; onPlace: SearchProps['onPlace'] }) {
  const { t } = useTranslation();
  const place = useApp((s) => s[kind]);
  const label = t(kind === 'home' ? 'search.home' : 'search.work');
  const setPlace = () => router.push({ pathname: '/yer-ara', params: { purpose: kind } });
  return (
    <ShortcutTile
      icon={kind === 'home' ? 'home' : 'briefcase'}
      label={label}
      a11yLabel={
        place
          ? t('ara.a11ySavedPlace', { label, place: place.label })
          : t('ara.a11yAddPlace', { label })
      }
      a11yHint={place ? t('search.longPressHint') : undefined}
      onPress={() => (place ? onPlace(place, place.label) : setPlace())}
      onLongPress={place ? setPlace : undefined}
    />
  );
}

type SearchProps = {
  section: SearchSection;
  /** Open the chat with this text. */
  onAsk: (text: string) => void;
  /** Open results around a place (same as tapping a popular place on the home). */
  onPlace: (target: LatLng, label: string) => void;
};

/** What the screen shows before anything is typed. */
export function EmptyState({ section, onAsk, onPlace }: SearchProps) {
  const c = useColors();
  const { t } = useTranslation();
  const recent = useApp((s) => s.recentSearches);
  const clearRecent = useApp((s) => s.clearRecentSearches);
  const [locating, setLocating] = useState(false);

  const nearMe = async () => {
    if (locating) return;
    if (section === 'park') return router.push({ pathname: '/sonuc', params: { near: '1' } });
    setLocating(true);
    try {
      await openFoodNearMe(t('results.myLocation'), undefined, true);
    } finally {
      setLocating(false);
    }
  };
  const pickOnMap = () =>
    router.push({
      pathname: '/konum-sec',
      params: pickerParams({ purpose: 'search', food: section === 'food' }),
    });

  return (
    <>
      <SectionTitle text={t('ara.shortcuts')} />
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16 }}>
        <ShortcutTile
          icon="locate"
          label={t('ara.myLocation')}
          a11yLabel={t('ara.a11yMyLocation')}
          busy={locating}
          onPress={() => void nearMe()}
        />
        <SavedTile kind="home" onPlace={onPlace} />
        <SavedTile kind="work" onPlace={onPlace} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('ara.pickOnMap')}
        onPress={pickOnMap}
        style={({ pressed }) => ({
          marginTop: 8,
          marginHorizontal: 16,
          minHeight: 48,
          borderRadius: 16,
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: c.dashed,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          backgroundColor: pressed ? c.surface : 'transparent',
        })}
      >
        <Icon name="map" size={18} color={c.text} />
        <Txt style={{ fontFamily: fonts.bodyBold, fontSize: 13, lineHeight: 18 }}>
          {t('ara.pickOnMap')}
        </Txt>
      </Pressable>

      {recent.length > 0 && (
        <>
          <SectionTitle
            text={t('ara.recent')}
            right={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('ara.clearRecent')}
                onPress={clearRecent}
                hitSlop={8}
                style={{ minHeight: HIT, justifyContent: 'center' }}
              >
                <Txt style={{ fontFamily: fonts.bodyBold, fontSize: 12 }} color={c.accentStrong}>
                  {t('ara.clear')}
                </Txt>
              </Pressable>
            }
          />
          <Group>
            {recent.slice(0, RECENT_SHOWN).map((q, i) => (
              <Row
                key={q}
                first={i === 0}
                label={q}
                title={q}
                onPress={() => onAsk(q)}
                icon={
                  <Tile bg={c.surface}>
                    <Icon name="clock" size={18} color={c.textSecondary} />
                  </Tile>
                }
              />
            ))}
          </Group>
        </>
      )}

      <SectionTitle text={t('ara.examples')} />
      <ChipWrap>
        {EXAMPLE_KEYS.map((key, i) => (
          <SuggestionChip
            key={key}
            label={t(`ara.${key}`)}
            bg={i % 2 === 0 ? c.badgeNearBg : c.badgeFreshBg}
            onPress={() => onAsk(t(`ara.${key}`))}
          />
        ))}
      </ChipWrap>

      <SectionTitle text={t('ara.popular')} />
      <ChipWrap>
        {POPULAR_PLACES.map((p) => (
          <SuggestionChip
            key={p.id}
            label={p.name}
            bg={c.card}
            onPress={() => onPlace(p, p.name)}
          />
        ))}
      </ChipWrap>
    </>
  );
}
