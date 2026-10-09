import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { TFunction } from 'i18next';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  ActionSheetIOS,
  Alert,
  Pressable,
  ScrollView,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActiveParkCard } from '@/components/ActiveParkCard';
import { CarMark } from '@/components/CarMark';
import { CityButton } from '@/components/CityPicker';
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
import { ModeChips } from '@/components/ModeChips';
import { NearbyNow } from '@/components/NearbyNow';
import { PMark } from '@/components/PMark';
import { Skyline } from '@/components/Skyline';
import { Txt } from '@/components/Txt';
import type { LatLng } from '@/data/geo';
import { POPULAR_PLACES } from '@/data/places';
import { localPart, parseQuery } from '@/data/intent';
import type { FoodCategory } from '@/data/restaurants';
import { fold, searchPlaces, splitPlaceAndCategory, type SearchHit } from '@/data/search';
import { useAnnounce } from '@/lib/a11y';
import { currentLocation, reverseStreet } from '@/lib/location';
import { currentLocationLabel } from '@/lib/park';
import { pickerParams } from '@/lib/pickPlace';
import { resolvePlace, usePlaceSearch } from '@/lib/usePlaceSearch';
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

function SavedCard({ kind, stacked }: { kind: 'home' | 'work'; stacked: boolean }) {
  const c = useColors();
  const { t } = useTranslation();
  const place = useApp((s) => s[kind]);
  const setPlace = useApp((s) => (kind === 'home' ? s.setHome : s.setWork));
  const label = t(kind === 'home' ? 'search.home' : 'search.work');

  const [saving, setSaving] = useState(false);

  const saveCurrent = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const loc = await currentLocation(true, 8000);
      if (!loc) return Alert.alert(t('search.locationFailed'));
      const address = await reverseStreet(loc);
      const saved: SavedPlace = {
        label: currentLocationLabel(address, new Date(), (time) =>
          t('search.myLocationLabel', { time }),
        ),
        ...loc,
      };
      setPlace(saved);
    } finally {
      setSaving(false);
    }
  };

  const searchAddress = () => router.push({ pathname: '/yer-ara', params: { purpose: kind } });
  const pickOnMap = () =>
    router.push({ pathname: '/konum-sec', params: pickerParams({ purpose: kind }) });
  const remove = () =>
    Alert.alert(t('search.removeConfirm', { label }), undefined, [
      { text: t('search.remove'), style: 'destructive', onPress: () => setPlace(null) },
      { text: t('common.cancel'), style: 'cancel' },
    ]);

  // Tap on an empty tile and long press / pencil on a saved one open the same sheet.
  const openSheet = () => {
    if (saving) return;
    const actions: { text: string; run: () => void }[] = [
      { text: t('search.searchAddress'), run: searchAddress },
      { text: t('search.saveCurrent'), run: () => void saveCurrent() },
      { text: t('search.pickOnMap'), run: pickOnMap },
      ...(place ? [{ text: t('search.remove'), run: remove }] : []),
    ];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: t('search.saveChoiceTitle', { label }),
        options: [...actions.map((a) => a.text), t('common.cancel')],
        cancelButtonIndex: actions.length,
        destructiveButtonIndex: place ? actions.length - 1 : undefined,
      },
      (i) => actions[i]?.run(),
    );
  };

  return (
    <View
      style={[
        asym(16, 5),
        {
          flex: stacked ? undefined : 1,
          minHeight: 52,
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: place ? c.card : 'transparent',
        },
        place && { borderWidth: 1, borderColor: c.line },
      ]}
    >
      {!place && <DashedFrame color={c.dashed} radius={16} tight={5} />}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={place ? `${label}: ${place.label}` : `${label} ${t('search.add')}`}
        accessibilityHint={place ? t('search.longPressHint') : undefined}
        disabled={saving}
        accessibilityState={{ busy: saving }}
        onPress={() => (place ? openResults(place, place.label) : openSheet())}
        onLongPress={openSheet}
        style={{
          flex: 1,
          minHeight: 52,
          paddingLeft: 12,
          paddingRight: place ? 0 : 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        {saving ? (
          <ActivityIndicator color={c.text} accessibilityLabel={t('a11y.loading')} />
        ) : (
          <Icon name={kind === 'home' ? 'home' : 'briefcase'} size={20} color={c.text} />
        )}
        <Txt variant="bodyBold" numberOfLines={2} style={{ flex: 1, fontSize: 14 }}>
          {place ? `${label} · ${place.label}` : label}
          {!place && (
            <Txt variant="bodyBold" secondary style={{ fontSize: 14 }}>
              {` · ${t('search.add')}`}
            </Txt>
          )}
        </Txt>
      </Pressable>
      {place && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('search.a11yEdit', { label })}
          disabled={saving}
          onPress={openSheet}
          style={{ width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="edit" size={18} color={c.textSecondary} />
        </Pressable>
      )}
    </View>
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
  const { fontScale } = useWindowDimensions();
  // Large text: the mode switch gets its own line and Ev/İş stack.
  const bigText = fontScale > 1.3;
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
  const { hits, settled, deferredQuery } = usePlaceSearch(query, localPart);
  const intent = useMemo(() => parseQuery(deferredQuery), [deferredQuery]);
  const guide = query.trim().length >= 2 && settled && intent.kind !== 'search' ? intent.kind : null;
  const split = useMemo(
    () => (food ? splitPlaceAndCategory(deferredQuery) : null),
    [food, deferredQuery],
  );

  const go = (target: LatLng, label: string, cat?: FoodCategory) =>
    food ? openFood(target, label, cat) : openResults(target, label);
  // Place + category ("Bornova balık") opens the restaurant list there with the category.
  const pick = (h: SearchHit) => go(h, h.name, split?.cat);
  const foodMatches = useMemo(
    () => (food ? matchRestaurants(deferredQuery) : []),
    [food, deferredQuery],
  );

  // VoiceOver does not read a list that appears while typing: say how many, once typing pauses.
  const suggestionCount = hits.length + foodMatches.length;
  useAnnounce(
    query.trim().length >= 2 && settled
      ? suggestionCount > 0
        ? t('a11y.suggestionCount', { count: suggestionCount })
        : t('a11y.suggestionNone')
      : null,
    700,
    query.trim(),
  );

  const submit = async () => {
    const q = query.trim();
    if (!q) return;
    const it = parseQuery(q);
    // The guide card is already on screen.
    if (it.kind !== 'search') return;
    // A strong restaurant name match opens that restaurant.
    const qf = fold(q);
    if (qf.split(' ').length >= 2) {
      const r = matchRestaurants(q, 1)[0];
      if (r && fold(r.name).startsWith(qf)) {
        return router.push({ pathname: '/restoran/[id]', params: { id: r.id } });
      }
    }
    if (it.cat) {
      const opts = {
        park: it.requireParking || undefined,
        dish: it.dish ?? undefined,
        quality: it.quality || undefined,
      };
      if (it.district) {
        openFood({ lat: it.district.lat, lng: it.district.lng }, it.district.name, it.cat, opts);
        return;
      } else if (it.placeQuery) {
        const h = searchPlaces(it.placeQuery, 1)[0];
        if (h) {
          openFood(h, h.name, it.cat, opts);
          return;
        }
      } else {
        if (locating) return;
        setLocating(true);
        await openFoodNearMe(t('results.myLocation'), it.cat, false, opts).finally(() =>
          setLocating(false),
        );
        return;
      }
    }
    if (!it.cat && it.food) {
      const opts = {
        park: it.requireParking || undefined,
        dish: it.dish ?? undefined,
        quality: it.quality || undefined,
      };
      if (it.district) {
        openFood({ lat: it.district.lat, lng: it.district.lng }, it.district.name, undefined, opts);
        return;
      } else if (it.placeQuery) {
        const h = searchPlaces(it.placeQuery, 1)[0];
        if (h) {
          openFood(h, h.name, undefined, opts);
          return;
        }
      } else {
        if (locating) return;
        setLocating(true);
        await openFoodNearMe(t('results.myLocation'), undefined, false, opts).finally(() =>
          setLocating(false),
        );
        return;
      }
    }
    if (!it.cat && !it.food && it.district) {
      go({ lat: it.district.lat, lng: it.district.lng }, it.district.name);
      return;
    }
    // The deferred `split` may lag behind the text box; read the current text.
    const current = food ? splitPlaceAndCategory(query) : null;
    const pickNow = (h: SearchHit) => go(h, h.name, current?.cat);
    // Suggestions that lag behind the text box are not trusted on submit.
    if (settled && hits[0]) return pickNow(hits[0]);
    if (settled && food && foodMatches[0])
      return router.push({ pathname: '/restoran/[id]', params: { id: foodMatches[0].id } });
    setBusy(true);
    let point: LatLng | null = null;
    try {
      const found = await resolvePlace(q);
      if (found.hit) return pickNow(found.hit);
      point = found.point;
    } finally {
      setBusy(false);
    }
    if (!point) {
      // Never a dead end: offer to mark the place on the map.
      return Alert.alert(t('search.notFoundTitle'), t('search.notFoundBody'), [
        { text: t('search.pickOnMap'), onPress: () => openPicker(q) },
        { text: t('common.cancel'), style: 'cancel' },
      ]);
    }
    go(point, q);
  };
  const openPicker = (q: string) =>
    router.push({
      pathname: '/konum-sec',
      params: pickerParams({
        purpose: 'search',
        q,
        food,
        cat: food ? splitPlaceAndCategory(q)?.cat : undefined,
      }),
    });
  const foodIntent =
    !guide && intent.kind === 'search' && (intent.cat || intent.food)
      ? t('search.foodIntent', {
          what:
            (intent.cat ? t(`food.cats.${intent.cat}`) : t('food.all')) +
            (intent.dish ? ` · ${intent.dish}` : '') +
            (intent.requireParking ? ' · 🅿️' : ''),
          where: intent.district?.name ?? (intent.placeQuery || t('search.nearMe')),
        })
      : null;
  const showMapRow =
    query.trim().length >= 3 &&
    settled &&
    hits.length === 0 &&
    foodMatches.length === 0 &&
    !(intent.kind === 'search' && intent.cat) &&
    !guide;

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
            {!bigText && <ModeSwitch mode={section} onChange={setSection} />}
          </View>
          <View style={{ marginTop: 8 }}>
            <CityButton />
          </View>
          {bigText && (
            <View style={{ marginTop: 12, alignSelf: 'flex-start' }}>
              <ModeSwitch mode={section} onChange={setSection} />
            </View>
          )}
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
              <ActivityIndicator
                color={c.text}
                style={{ width: HIT }}
                accessibilityLabel={t('a11y.loading')}
              />
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

        {guide && (
          <View
            accessibilityLiveRegion="polite"
            style={[
              asym(18, 5),
              {
                marginHorizontal: 16,
                marginTop: 12,
                padding: 16,
                gap: 12,
                backgroundColor: c.card,
                borderWidth: 1,
                borderColor: c.line,
              },
            ]}
          >
            <Txt variant="bodyBold">
              {guide === 'greeting' ? t('search.guideHello') : t('search.guideUnknown')}
            </Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {(['search.exampleKofte', 'search.exampleBreakfast', 'search.exampleFish'] as const).map(
                (key) => (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    onPress={() => setQuery(t(key))}
                    style={({ pressed }) => [
                      asym(14, 4),
                      {
                        minHeight: 44,
                        paddingHorizontal: 14,
                        justifyContent: 'center',
                        backgroundColor: pressed ? c.surface : c.card,
                        borderWidth: 1,
                        borderColor: c.line,
                      },
                    ]}
                  >
                    <Txt variant="bodyBold">{t(key)}</Txt>
                  </Pressable>
                ),
              )}
            </View>
          </View>
        )}

        {showMapRow && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('search.pickOnMap')}
            onPress={() => openPicker(query.trim())}
            style={({ pressed }) => [
              asym(18, 5),
              {
                marginHorizontal: 16,
                marginTop: 12,
                minHeight: HIT + 4,
                paddingHorizontal: 16,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                backgroundColor: pressed ? c.surface : c.card,
                borderWidth: 1,
                borderColor: c.line,
              },
            ]}
          >
            <Icon name="map" size={20} color={c.text} />
            <Txt variant="bodyBold">{t('search.pickOnMap')}</Txt>
          </Pressable>
        )}

        {!guide && (hits.length > 0 || foodMatches.length > 0 || foodIntent) && (
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
            {foodIntent && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={foodIntent}
                onPress={() => void submit()}
                style={({ pressed }) => ({
                  minHeight: HIT + 4,
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  justifyContent: 'center',
                  backgroundColor: pressed ? c.surface : c.card,
                })}
              >
                <Txt variant="bodyBold" numberOfLines={2}>
                  {foodIntent}
                </Txt>
              </Pressable>
            )}
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
                  borderTopWidth: i === 0 && foodMatches.length === 0 && !foodIntent ? 0 : 1,
                  borderTopColor: c.line,
                  backgroundColor: pressed ? c.surface : c.card,
                })}
              >
                <Txt variant="bodyBold" numberOfLines={2}>
                  {h.name}
                </Txt>
                <Txt variant="caption" secondary numberOfLines={2}>
                  {hitSubtitle(h, t)}
                </Txt>
              </Pressable>
            ))}
          </View>
        )}

        {!food && <ModeChips mode={mode} onChange={setMode} />}

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
              <View style={{ flexDirection: bigText ? 'column' : 'row', gap: 10 }}>
                <SavedCard kind="home" stacked={bigText} />
                <SavedCard kind="work" stacked={bigText} />
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
                  <Txt style={{ fontFamily: fonts.display, fontSize: 15 }} numberOfLines={2}>
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
