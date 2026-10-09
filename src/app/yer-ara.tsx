import { router, useLocalSearchParams } from 'expo-router';
import type { TFunction } from 'i18next';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Txt } from '@/components/Txt';
import type { SearchHit } from '@/data/search';
import { firstParam } from '@/lib/params';
import { pickerParams } from '@/lib/pickPlace';
import { resolvePlace, usePlaceSearch } from '@/lib/usePlaceSearch';
import { useApp } from '@/store/app';
import { asym, fonts, HIT, useColors } from '@/theme';

function hitSubtitle(h: SearchHit, t: TFunction): string {
  return [
    t(`search.kind.${h.kind}`),
    h.subtitle ?? h.district,
    h.far ? t('search.outside') : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Address search for Ev / İş: same suggestions as the home search, a pick saves and goes back. */
export default function PlaceSearchScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const kind = firstParam(params.purpose) === 'work' ? 'work' : 'home';
  const label = t(kind === 'home' ? 'search.home' : 'search.work');
  const setPlace = useApp((s) => (kind === 'home' ? s.setHome : s.setWork));

  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const { hits, settled } = usePlaceSearch(query);
  const savedRef = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const save = (name: string, p: { lat: number; lng: number }) => {
    if (savedRef.current) return;
    savedRef.current = true;
    setPlace({ label: name, lat: p.lat, lng: p.lng });
    router.back();
  };

  const openPicker = () =>
    router.replace({ pathname: '/konum-sec', params: pickerParams({ purpose: kind, q: query }) });

  const submit = async () => {
    const q = query.trim();
    if (!q || busy || savedRef.current) return;
    if (settled && hits[0]) return save(hits[0].name, hits[0]);
    setBusy(true);
    try {
      const found = await resolvePlace(q);
      if (!alive.current || savedRef.current) return;
      if (found.hit) return save(found.hit.name, found.hit);
      if (found.point) return save(q, found.point);
    } finally {
      if (alive.current) setBusy(false);
    }
    Alert.alert(t('search.notFoundTitle'), t('search.notFoundBody'), [
      { text: t('search.pickOnMap'), onPress: openPicker },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const showMapRow = query.trim().length >= 3 && settled && hits.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 8 }}>
      <View style={{ paddingHorizontal: 16 }}>
        <ScreenHeader title={t('search.savePrompt', { label })} back />
      </View>
      <View
        style={[
          asym(20, 6),
          {
            marginHorizontal: 16,
            marginTop: 12,
            minHeight: 56,
            paddingLeft: 16,
            paddingRight: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: c.card,
            borderWidth: 1,
            borderColor: c.line,
          },
        ]}
      >
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={submit}
          autoFocus
          placeholder={t('search.placeSearchPlaceholder')}
          placeholderTextColor={c.textSecondary}
          accessibilityLabel={t('search.placeSearchA11y', { label })}
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
        {busy && <ActivityIndicator color={c.text} accessibilityLabel={t('a11y.loading')} />}
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 32 }}>
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
                onPress={() => !busy && save(h.name, h)}
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
        {showMapRow && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('search.pickOnMap')}
            onPress={openPicker}
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
      </ScrollView>
    </View>
  );
}
