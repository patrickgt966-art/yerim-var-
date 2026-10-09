import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { TFunction } from 'i18next';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActiveParkCard } from '@/components/ActiveParkCard';
import { CarMark } from '@/components/CarMark';
import { Chip } from '@/components/Chip';
import { DashedFrame } from '@/components/DashedFrame';
import {
  CategoryGrid,
  matchRestaurants,
  ModeSwitch,
  openFood,
  openFoodNearMe,
  RestaurantSuggestions,
  type HomeMode,
} from '@/components/FoodHome';
import { Icon, type IconName } from '@/components/Icon';
import { NearbyNow } from '@/components/NearbyNow';
import { PMark } from '@/components/PMark';
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
import { categoryForQuery, type FoodCategory } from '@/data/restaurants';
import { fold, searchPlaces, splitPlaceAndCategory, type SearchHit } from '@/data/search';
import { geocode } from '@/lib/location';
import { useApp, type SavedPlace } from '@/store/app';
import { asym, brand, fonts, HIT, useColors } from '@/theme';

function hitSubtitle(h: SearchHit, t: TFunction): string {
  return [
    t(`search.kind.${h.kind}`),
    h.subtitle ?? h.district,
    h.far ? t('search.outside') : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}

function openResults(target: LatLng, label: string) {
  router.push({
    pathname: '/sonuc',
    params: { lat: String(target.lat), lng: String(target.lng), label },
  });
}

function IconTile({ name }: { name: IconName }) {
  const c = useColors();
  return (
    <View
      style={[
        asym(12, 3),
        {
          width: 40,
          height: 40,
          backgroundColor: c.badgeNearBg,
          alignItems: 'center',
          justifyContent: 'center',
        },
      ]}
    >
      <Icon name={name} size={22} color={c.text} />
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
        asym(16, 5),
        {
          flex: 1,
          minHeight: 52,
          paddingHorizontal: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: place ? c.card : 'transparent',
        },
        place && { borderWidth: 1, borderColor: c.line },
      ]}
    >
      {!place && <DashedFrame color={c.dashed} radius={16} tight={5} />}
      <Icon name={kind === 'home' ? 'home' : 'briefcase'} size={20} color={c.text} />
      <Txt variant="bodyBold" numberOfLines={1} style={{ flex: 1, fontSize: 14 }}>
        {place ? `${label} · ${place.label}` : label}
        {!place && (
          <Txt variant="bodyBold" secondary style={{ fontSize: 14 }}>
            {` · ${t('search.add')}`}
          </Txt>
        )}
      </Txt>
    </Pressable>
  );
}

export default function SearchScreen() {
  // White status-bar text over the navy hero, only while this tab is shown.
  // A fixed navy strip keeps it readable when the hero scrolls away.
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const c = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  // Chosen section lives in component state only.
  const [section, setSection] = useState<HomeMode>('park');
  const food = section === 'food';
  const mode = useApp((s) => s.mode);
  const setMode = useApp((s) => s.setMode);
  const active = useApp((s) => s.active);

  // Bundled İzmir places first: Apple's geocoder only knows addresses.
  // "Bornova balık" searches the place part only; the category word is applied on submit.
  const split = useMemo(() => (food ? splitPlaceAndCategory(query) : null), [food, query]);
  const local = useMemo(() => searchPlaces(split ? split.placeQuery : query), [split, query]);
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

  const go = (target: LatLng, label: string, cat?: FoodCategory) =>
    food ? openFood(target, label, cat) : openResults(target, label);
  // Place + category ("Bornova balık") opens the restaurant list there with the category.
  const pick = (h: SearchHit) => go(h, h.name, split?.cat);
  const foodMatches = useMemo(() => (food ? matchRestaurants(query) : []), [food, query]);

  const submit = async () => {
    const q = query.trim();
    if (!q) return;
    if (food) {
      const cat = split ? null : categoryForQuery(q);
      if (cat) {
        if (locating) return;
        setLocating(true);
        await openFoodNearMe(t('results.myLocation'), cat).finally(() => setLocating(false));
        return;
      }
    }
    if (hits[0]) return pick(hits[0]);
    if (food && foodMatches[0])
      return router.push({ pathname: '/restoran/[id]', params: { id: foodMatches[0].id } });
    setBusy(true);
    const [fromApple] = await searchApplePlaces(q);
    if (fromApple) {
      setBusy(false);
      return pick(fromApple);
    }
    const hit = await geocode(q);
    setBusy(false);
    if (!hit) return Alert.alert(t('search.notFound'));
    go(hit, q);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {focused && <StatusBar style="light" />}
      <ScrollView
        style={{ flex: 1, backgroundColor: c.bg }}
        contentContainerStyle={{ paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero */}
        <View
          style={{
            backgroundColor: c.hero,
            paddingTop: insets.top + 12,
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
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
              <PMark size={30} />
              <Txt
                style={{ fontFamily: fonts.display, fontSize: 21 }}
                color={brand.white}
                numberOfLines={1}
                accessibilityRole="header"
              >
                yerim{' '}
                <Txt style={{ fontFamily: fonts.display, fontSize: 21 }} color={brand.orange}>
                  var
                </Txt>
              </Txt>
            </View>
            <ModeSwitch mode={section} onChange={setSection} />
          </View>
          <Txt
            variant="display"
            color={brand.white}
            style={{ marginTop: 18, fontSize: 32, lineHeight: 36, letterSpacing: -0.5 }}
            accessibilityRole="header"
          >
            {food ? (
              t('food.headline')
            ) : (
              <>
                {t('search.title1')}
                <Txt
                  variant="display"
                  color={brand.orangeLight}
                  style={{ fontSize: 32, lineHeight: 36, letterSpacing: -0.5 }}
                >
                  {t('search.title2')}
                </Txt>
                {t('search.title3')}
              </>
            )}
          </Txt>
        </View>

        {/* Search box overlapping the hero */}
        <View style={{ marginTop: -30, marginHorizontal: 16 }}>
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
              placeholder={t(food ? 'food.placeholder' : 'search.placeholder')}
              placeholderTextColor={c.textSecondary}
              accessibilityLabel={t(food ? 'food.a11yInput' : 'search.a11yInput')}
              returnKeyType="search"
              autoCorrect={false}
              style={{
                flex: 1,
                minHeight: HIT,
                fontFamily: fonts.body,
                fontSize: 16,
                color: c.text,
              }}
            />
            {busy || locating ? (
              <ActivityIndicator color={c.text} style={{ width: HIT }} />
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('search.a11yLocate')}
                onPress={async () => {
                  if (!food) return router.push({ pathname: '/sonuc', params: { near: '1' } });
                  if (locating) return;
                  setLocating(true);
                  await openFoodNearMe(t('results.myLocation'), undefined, true);
                  setLocating(false);
                }}
                style={[
                  asym(15, 5),
                  {
                    width: 48,
                    height: 48,
                    backgroundColor: food ? brand.navy : c.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                  },
                ]}
              >
                <Icon name="locate" size={20} color={food ? brand.white : brand.navy} />
              </Pressable>
            )}
          </View>
        </View>

        {(hits.length > 0 || foodMatches.length > 0) && (
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
            {food && <RestaurantSuggestions matches={foodMatches} />}
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
                  borderTopWidth: i === 0 && foodMatches.length === 0 ? 0 : 1,
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

        {!food && (
          <View style={{ flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 12 }}>
            <Chip
              label={t('search.now')}
              icon="clock"
              selected={mode === 'now'}
              onPress={() => setMode('now')}
            />
            <Chip
              label={t('search.twoHours')}
              icon="hourglass"
              selected={mode === 'twoHours'}
              onPress={() => setMode('twoHours')}
            />
          </View>
        )}

        <View style={{ paddingHorizontal: 16, gap: 12, marginTop: 16 }}>
          {!food && active && (
            <>
              <Txt variant="title" accessibilityRole="header">
                {t('search.active')}
              </Txt>
              <ActiveParkCard active={active} />
            </>
          )}

          {food ? (
            <>
              <Txt variant="title" accessibilityRole="header">
                {t('food.categoriesTitle')}
              </Txt>
              <CategoryGrid />
            </>
          ) : (
            <>
              <NearbyNow />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <SavedCard kind="home" />
                <SavedCard kind="work" />
              </View>
            </>
          )}

          <Txt
            accessibilityRole="header"
            style={{ fontFamily: fonts.display, fontSize: 19, lineHeight: 24, marginTop: 4 }}
          >
            {t(food ? 'food.popularFood' : 'search.popular')}
          </Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {POPULAR_PLACES.map((p) => (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                accessibilityLabel={`${p.name}, ${p.district}`}
                onPress={() => go(p, p.name)}
                style={[
                  asym(18, 5),
                  {
                    flexBasis: '47%',
                    flexGrow: 1,
                    minHeight: 64,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    backgroundColor: c.card,
                    borderWidth: 1,
                    borderColor: c.line,
                  },
                ]}
              >
                <IconTile name={p.icon as IconName} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt style={{ fontFamily: fonts.display, fontSize: 15 }} numberOfLines={1}>
                    {p.name}
                  </Txt>
                  <Txt variant="label" secondary numberOfLines={1}>
                    {p.district}
                  </Txt>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: insets.top,
          backgroundColor: c.hero,
        }}
      />
    </View>
  );
}
