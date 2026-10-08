import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActiveParkCard } from '@/components/ActiveParkCard';
import { CarMark } from '@/components/CarMark';
import { Chip } from '@/components/Chip';
import { DashedFrame } from '@/components/DashedFrame';
import { Icon, type IconName } from '@/components/Icon';
import { Skyline } from '@/components/Skyline';
import { Txt } from '@/components/Txt';
import type { LatLng } from '@/data/geo';
import { POPULAR_PLACES } from '@/data/places';
import {
  APPLE_MIN_CHARS,
  mergeHits,
  searchApplePlaces,
  useAppleSuggestions,
} from '@/data/appleSearch';
import { fold, searchPlaces, type SearchHit } from '@/data/search';
import { geocode } from '@/lib/location';
import { useApp, type SavedPlace } from '@/store/app';
import { asym, brand, fonts, HIT, useColors } from '@/theme';

function hitSubtitle(h: SearchHit, t: TFunction): string {
  const kind = t(`search.kind.${h.kind}`);
  return h.subtitle ? `${kind} · ${h.subtitle}` : kind;
}

function openResults(target: LatLng, label: string) {
  router.push({
    pathname: '/sonuc',
    params: { lat: String(target.lat), lng: String(target.lng), label },
  });
}

function IconBubble({ name, size = 44 }: { name: IconName; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: brand.cream,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={name} size={size * 0.55} color={brand.navy} />
    </View>
  );
}

function SavedCard({ kind }: { kind: 'home' | 'work' }) {
  const c = useColors();
  const { t } = useTranslation();
  const place = useApp((s) => s[kind]);
  const setPlace = useApp((s) => (kind === 'home' ? s.setHome : s.setWork));
  const label = t(kind === 'home' ? 'search.home' : 'search.work');

  const edit = () =>
    Alert.prompt(
      t('search.savePrompt', { label }),
      undefined,
      async (text) => {
        const hit = await geocode(text);
        if (!hit) return Alert.alert(t('search.saveFailed'));
        const saved: SavedPlace = { label: text.trim(), ...hit };
        setPlace(saved);
      },
      'plain-text',
      place?.label ?? '',
    );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={place ? `${label}: ${place.label}` : `${label} ${t('search.add')}`}
      accessibilityHint={place ? t('search.longPressHint') : undefined}
      onPress={() => (place ? openResults(place, place.label) : edit())}
      onLongPress={edit}
      style={[
        asym(22, 6),
        {
          flex: 1,
          minHeight: 76,
          padding: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          backgroundColor: place ? c.card : 'transparent',
        },
        place && { borderWidth: 1, borderColor: c.line },
      ]}
    >
      {!place && <DashedFrame color={c.dashed} />}
      <IconBubble name={kind === 'home' ? 'home' : 'briefcase'} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt style={{ fontFamily: fonts.display, fontSize: 18 }}>{label}</Txt>
        <Txt variant="caption" secondary numberOfLines={1}>
          {place ? place.label : t('search.add')}
        </Txt>
      </View>
    </Pressable>
  );
}

export default function SearchScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const mode = useApp((s) => s.mode);
  const setMode = useApp((s) => s.setMode);
  const active = useApp((s) => s.active);

  // Bundled İzmir places first: Apple's geocoder only knows addresses.
  const local = useMemo(() => searchPlaces(query), [query]);
  // Places our list does not know come from Apple Maps (native builds only).
  const apple = useAppleSuggestions(query);
  // Use Apple results only for exactly the text in the box: the request is
  // debounced, so they may belong to an earlier, shorter query.
  const appleCurrent =
    apple.forQuery === fold(query.trim()) && query.trim().length >= APPLE_MIN_CHARS;
  const hits = useMemo(
    () => mergeHits(local, appleCurrent ? (apple.data ?? []) : []),
    [local, appleCurrent, apple.data],
  );

  const pick = (h: SearchHit) => openResults(h, h.name);

  const submit = async () => {
    const q = query.trim();
    if (!q) return;
    if (hits[0]) return pick(hits[0]);
    setBusy(true);
    const [fromApple] = await searchApplePlaces(q);
    if (fromApple) {
      setBusy(false);
      return pick(fromApple);
    }
    const hit = await geocode(q);
    setBusy(false);
    if (!hit) return Alert.alert(t('search.notFound'));
    openResults(hit, q);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Hero */}
      <View
        style={{
          backgroundColor: c.hero,
          paddingTop: insets.top + 16,
          paddingHorizontal: 20,
          paddingBottom: 56,
          borderBottomLeftRadius: 8,
          borderBottomRightRadius: 40,
          overflow: 'hidden',
        }}
      >
        <View style={{ position: 'absolute', right: 0, bottom: 0 }}>
          <Skyline />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              backgroundColor: '#FFFFFF',
              overflow: 'hidden',
            }}
          >
            <CarMark size={34} bay={brand.navy} glass="#FFFFFF" wheels={false} lights={false} />
          </View>
          <Txt
            style={{ fontFamily: fonts.display, fontSize: 22 }}
            color="#FFFFFF"
            accessibilityRole="header"
          >
            yerim{' '}
            <Txt style={{ fontFamily: fonts.display, fontSize: 22 }} color={brand.orange}>
              var
            </Txt>
          </Txt>
        </View>
        <Txt variant="display" color="#FFFFFF" style={{ marginTop: 16 }} accessibilityRole="header">
          {t('search.title1')}
          <Txt variant="display" color={brand.orangeLight}>
            {t('search.title2')}
          </Txt>
          {t('search.title3')}
        </Txt>
      </View>

      {/* Search box overlapping the hero */}
      <View style={{ marginTop: -36, marginHorizontal: 16 }}>
        <View
          style={[
            asym(26, 8),
            {
              minHeight: 64,
              paddingLeft: 16,
              paddingRight: 8,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              backgroundColor: c.card,
              shadowColor: '#0B3C49',
              shadowOpacity: 0.14,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 6 },
            },
          ]}
        >
          <CarMark size={26} bay={c.text} glass={brand.navy} wheels={false} lights={false} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={submit}
            placeholder={t('search.placeholder')}
            placeholderTextColor={c.textSecondary}
            accessibilityLabel={t('search.a11yInput')}
            returnKeyType="search"
            autoCorrect={false}
            style={{ flex: 1, minHeight: HIT, fontFamily: fonts.body, fontSize: 16, color: c.text }}
          />
          {busy ? (
            <ActivityIndicator color={c.text} style={{ width: HIT }} />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('search.a11yLocate')}
              onPress={() => router.push({ pathname: '/sonuc', params: { near: '1' } })}
              style={[
                asym(15, 5),
                {
                  width: 48,
                  height: 48,
                  backgroundColor: brand.navy,
                  alignItems: 'center',
                  justifyContent: 'center',
                },
              ]}
            >
              <Icon name="locate" size={20} color="#FFFFFF" />
            </Pressable>
          )}
        </View>
      </View>

      {hits.length > 0 && (
        <View
          accessibilityLabel={t('search.suggestions')}
          style={[
            asym(18, 5),
            {
              marginHorizontal: 16,
              marginTop: 12,
              backgroundColor: c.card,
              borderWidth: 1,
              borderColor: c.line,
              overflow: 'hidden',
            },
          ]}
        >
          {hits.map((h, i) => (
            <Pressable
              key={`${i}-${h.name}-${h.lat}-${h.lng}`}
              accessibilityRole="button"
              accessibilityLabel={`${h.name}, ${hitSubtitle(h, t)}`}
              onPress={() => pick(h)}
              style={({ pressed }) => ({
                minHeight: HIT + 4,
                paddingHorizontal: 16,
                paddingVertical: 8,
                justifyContent: 'center',
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: c.line,
                backgroundColor: pressed ? c.surface : c.card,
              })}
            >
              <Txt variant="bodyBold" numberOfLines={1}>
                {h.name}
              </Txt>
              <Txt variant="caption" secondary numberOfLines={1}>
                {hitSubtitle(h, t)}
              </Txt>
            </Pressable>
          ))}
        </View>
      )}

      <View style={{ paddingHorizontal: 16, gap: 12, marginTop: 16 }}>
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          <Chip
            label={t('search.now')}
            icon="clock"
            selected={mode === 'now'}
            onPress={() => setMode('now')}
            height={52}
          />
          <Chip
            label={t('search.twoHours')}
            icon="hourglass"
            selected={mode === 'twoHours'}
            onPress={() => setMode('twoHours')}
            height={52}
          />
        </View>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <SavedCard kind="home" />
          <SavedCard kind="work" />
        </View>

        <Txt variant="title" accessibilityRole="header" style={{ marginTop: 8 }}>
          {t('search.popular')}
        </Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {POPULAR_PLACES.map((p) => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityLabel={`${p.name}, ${p.district}`}
              onPress={() => openResults(p, p.name)}
              style={[
                asym(22, 6),
                {
                  flexBasis: '47%',
                  flexGrow: 1,
                  minHeight: 84,
                  padding: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  backgroundColor: c.card,
                  borderWidth: 1,
                  borderColor: c.line,
                },
              ]}
            >
              <IconBubble name={p.icon as IconName} size={48} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt style={{ fontFamily: fonts.display, fontSize: 17 }}>{p.name}</Txt>
                <Txt variant="caption" secondary>
                  {p.district}
                </Txt>
              </View>
            </Pressable>
          ))}
        </View>

        {active && (
          <>
            <Txt variant="title" accessibilityRole="header" style={{ marginTop: 8 }}>
              {t('search.active')}
            </Txt>
            <ActiveParkCard active={active} />
          </>
        )}
      </View>
    </ScrollView>
  );
}
