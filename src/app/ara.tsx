import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { handOffQuestion } from '@/components/chat/handoff';
import { matchRestaurants, openFood } from '@/components/FoodHome';
import { Icon } from '@/components/Icon';
import { Paper } from '@/components/lively/Paper';
import { EmptyState, type SearchSection } from '@/components/search/EmptyState';
import { TypingState } from '@/components/search/TypingState';
import { submitTarget } from '@/components/search/submitTarget';
import { sectionFor } from '@/components/search/understood';
import { Txt } from '@/components/Txt';
import type { LatLng } from '@/data/geo';
import { localPart, parseQuery } from '@/data/intent';
import { searchPlaces } from '@/data/search';
import { firstParam } from '@/lib/params';
import { useApp } from '@/store/app';
import { asym, brand, fonts, HIT, useColors } from '@/theme';

/** Full-screen search: shortcuts and history while empty, understanding and suggestions while typing. */
export default function SearchScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  // The home can say which section (Otopark / Restoran) it was in; otherwise it is inferred per query.
  const fixedSection: SearchSection | null =
    firstParam(params.section) === 'food'
      ? 'food'
      : firstParam(params.section) === 'park'
        ? 'park'
        : null;
  const addRecent = useApp((s) => s.addRecentSearch);

  const [query, setQuery] = useState('');
  const inputRef = useRef<TextInput>(null);
  const typing = query.trim().length > 0;

  const openChat = (text: string) => {
    const q = text.trim();
    if (!q) return;
    addRecent(q);
    handOffQuestion(q);
    router.replace({
      pathname: '/sohbet',
      params: { section: fixedSection ?? sectionFor(parseQuery(q)) },
    });
  };
  const openPlace = (target: LatLng, label: string) =>
    fixedSection === 'food'
      ? openFood(target, label)
      : router.push({
          pathname: '/sonuc',
          params: { lat: String(target.lat), lng: String(target.lng), label },
        });
  // The keyboard's "Ara": an obvious restaurant or place opens directly, anything else asks the chat.
  const submit = (text: string) => {
    const q = text.trim();
    if (!q) return;
    const target = submitTarget(
      q,
      parseQuery(q),
      matchRestaurants(q, 3),
      searchPlaces(localPart(q), 5),
    );
    if (target.kind === 'restaurant') {
      addRecent(q);
      router.push({ pathname: '/restoran/[id]', params: { id: target.id } });
    } else if (target.kind === 'place') {
      addRecent(q);
      openPlace(target.hit, target.hit.name);
    } else {
      openChat(q);
    }
  };
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Paper />
      <View
        style={{
          paddingTop: insets.top + 6,
          paddingBottom: 12,
          paddingHorizontal: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={goBack}
          style={{ width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="back" size={22} color={c.text} strokeWidth={2.4} />
        </Pressable>
        <View
          style={{
            flex: 1,
            minHeight: 50,
            paddingLeft: 12,
            paddingRight: 6,
            ...asym(20, 6),
            borderWidth: 2,
            borderColor: brand.orange,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: c.card,
            shadowColor: brand.navy,
            shadowOpacity: 0.06,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 2 },
            elevation: 1,
          }}
        >
          <Icon name="search" size={18} color={c.textSecondary} strokeWidth={2.2} />
          <TextInput
            ref={inputRef}
            autoFocus
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => submit(query)}
            placeholder={t('ara.placeholder')}
            placeholderTextColor={c.textSecondary}
            accessibilityLabel={t('ara.a11yInput')}
            returnKeyType="search"
            autoCorrect={false}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: HIT,
              fontFamily: fonts.bodyBold,
              fontSize: 16,
              color: c.text,
            }}
          />
          {query.length > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('ara.clear')}
              hitSlop={4}
              onPress={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: c.chipBg,
              }}
            >
              <Txt
                accessible={false}
                style={{ fontFamily: fonts.bodyExtraBold, fontSize: 14, lineHeight: 18 }}
              >
                ✕
              </Txt>
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {typing ? (
          <TypingState query={query} onAsk={openChat} onPlace={openPlace} />
        ) : (
          <EmptyState section={fixedSection ?? 'park'} onAsk={openChat} onPlace={openPlace} />
        )}
      </ScrollView>
    </View>
  );
}
