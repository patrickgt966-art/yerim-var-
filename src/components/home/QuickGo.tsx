import { router } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';

import { Txt } from '@/components/Txt';
import { hasLiveParking, isInCityArea } from '@/data/cities';
import { visibleFree } from '@/data/freshness';
import { walkMinutes } from '@/data/geo';
import { getRestaurant, nearestParking } from '@/data/restaurants';
import type { Parking } from '@/data/types';
import { rankByDistance, useParkings } from '@/data/useParkings';
import { isClosedNow } from '@/lib/openNow';
import { useApp } from '@/store/app';
import { asym, brand, fonts, HIT, useColors } from '@/theme';

/** Cards shown at most, add cards included. */
const MAX_CARDS = 6;
/** Car parks this close count as "at" the saved place. */
const AROUND_M = 700;
/** From this many free spaces the live pill is green. */
const PLENTY = 10;

type Tone = 'good' | 'few' | 'plain';
type Pill = { text: string; tone: Tone };
type Card =
  | {
      kind: 'place';
      key: string;
      which: 'home' | 'work';
      sub: string;
      pill: Pill;
      lat: number;
      lng: number;
    }
  | { kind: 'parking'; key: string; id: string; name: string; pill: Pill | null }
  | { kind: 'restaurant'; key: string; id: string; name: string; pill: Pill | null }
  | { kind: 'add'; key: string; which: 'home' | 'work' };

/** Interleaves lists (a1, b1, a2, b2, ...). */
function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length) out.push(a[i]!);
    if (i < b.length) out.push(b[i]!);
  }
  return out;
}

/** The pill for a saved place: free spaces around it with live data, else how many car parks. */
function placePill(
  place: { lat: number; lng: number },
  parkings: Parking[],
  t: (key: string, o?: Record<string, unknown>) => string,
): Pill {
  const around = rankByDistance(parkings, place, AROUND_M).filter((p) => !isClosedNow(p));
  if (hasLiveParking()) {
    const counts = around.map((p) => visibleFree(p)).filter((n): n is number => n != null);
    // Nothing fresh around: say how many car parks there are instead of a made-up zero.
    if (counts.length > 0) {
      const free = counts.reduce((a, b) => a + b, 0);
      return { text: t('home.quickFree', { count: free }), tone: free >= PLENTY ? 'good' : 'few' };
    }
  }
  return { text: t('home.quickCount', { count: around.length }), tone: 'plain' };
}

/**
 * "Hızlı git" (design V5.2): a swipeable strip under the two main jobs with Ev, İş and the latest
 * favourites, one tap each. Without anything saved it shows "Ev ekle / İş ekle" cards.
 */
export function QuickGo() {
  const { t } = useTranslation();
  const c = useColors();
  const city = useApp((s) => s.city);
  const home = useApp((s) => s.home);
  const work = useApp((s) => s.work);
  const favorites = useApp((s) => s.favorites);
  const favoriteRestaurants = useApp((s) => s.favoriteRestaurants);
  const parkings = useParkings().data?.parkings;

  const cards = useMemo(() => {
    const list = parkings ?? [];
    const tt = t as (key: string, o?: Record<string, unknown>) => string;
    const saved: Card[] = [];
    for (const which of ['home', 'work'] as const) {
      const place = which === 'home' ? home : work;
      if (!place || !isInCityArea(place)) continue;
      saved.push({
        kind: 'place',
        key: which,
        which,
        sub: place.label,
        pill: placePill(place, list, tt),
        lat: place.lat,
        lng: place.lng,
      });
    }
    // Most recently added first = the end of each array first.
    const parks = [...favorites].reverse().flatMap((f): Card[] => {
      if (!isInCityArea(f)) return [];
      const p = list.find((x) => x.id === f.id);
      const free = p && hasLiveParking() ? visibleFree(p) : null;
      const pill: Pill | null =
        free != null
          ? { text: tt('home.quickFree', { count: free }), tone: free >= PLENTY ? 'good' : 'few' }
          : p?.capacity != null
            ? { text: tt('home.quickCapacity', { count: p.capacity }), tone: 'plain' }
            : null;
      return [{ kind: 'parking', key: `p-${f.id}`, id: f.id, name: f.name, pill }];
    });
    const foods = [...favoriteRestaurants].reverse().flatMap((id): Card[] => {
      const r = getRestaurant(id);
      if (!r || !isInCityArea(r)) return [];
      const near = nearestParking(r, list);
      const pill: Pill | null = near
        ? { text: tt('home.quickWalk', { min: walkMinutes(r, near.parking) }), tone: 'good' }
        : null;
      return [{ kind: 'restaurant', key: `r-${id}`, id, name: r.name, pill }];
    });
    const out = [...saved, ...interleave(parks, foods)].slice(0, MAX_CARDS);
    if (!home) out.push({ kind: 'add', key: 'add-home', which: 'home' });
    if (!work) out.push({ kind: 'add', key: 'add-work', which: 'work' });
    return out.slice(0, MAX_CARDS);
    // `city` is not read here: the data helpers follow it, so a switch must recompute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parkings, home, work, favorites, favoriteRestaurants, city, t]);

  const hasSaved = !!home || !!work || favorites.length > 0 || favoriteRestaurants.length > 0;

  const tone = (x: Tone) =>
    x === 'good'
      ? { bg: brand.mintSoft, fg: brand.mintText }
      : x === 'few'
        ? { bg: brand.peachSoft, fg: brand.peachText }
        : { bg: brand.surface, fg: c.textSecondary };

  return (
    <View>
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 20,
          paddingBottom: 10,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <Txt
          accessibilityRole="header"
          style={{
            flexShrink: 1,
            fontFamily: fonts.display,
            fontSize: 22,
            lineHeight: 28,
            letterSpacing: -0.4,
          }}
        >
          {t('home.quickGo')}
        </Txt>
        {hasSaved && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('home.a11yQuickGoEdit')}
            onPress={() => router.push('/favoriler')}
            style={{
              minHeight: HIT,
              minWidth: HIT,
              justifyContent: 'center',
              alignItems: 'flex-end',
            }}
          >
            <Txt style={{ fontFamily: fonts.bodyBold, fontSize: 13 }} color={c.textSecondary}>
              {t('home.quickGoEdit')}
            </Txt>
          </Pressable>
        )}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 6, gap: 10 }}
      >
        {cards.map((card) => {
          if (card.kind === 'add') {
            const name = t(card.which === 'home' ? 'home.quickAddHome' : 'home.quickAddWork');
            const hint = t(
              card.which === 'home' ? 'home.quickAddHomeHint' : 'home.quickAddWorkHint',
            );
            return (
              <Pressable
                key={card.key}
                accessibilityRole="button"
                accessibilityLabel={`${name}. ${hint}`}
                onPress={() =>
                  router.push({ pathname: '/yer-ara', params: { purpose: card.which } })
                }
                style={[
                  asym(22, 6),
                  {
                    width: 148,
                    minHeight: 104,
                    padding: 12,
                    justifyContent: 'center',
                    borderWidth: 2,
                    borderStyle: 'dashed',
                    borderColor: brand.line,
                  },
                ]}
              >
                <Txt
                  style={{ fontFamily: fonts.display, fontSize: 22, lineHeight: 26 }}
                  color={brand.orange}
                >
                  ＋
                </Txt>
                <Txt style={{ fontFamily: fonts.bodyExtraBold, fontSize: 15, lineHeight: 20 }}>
                  {name}
                </Txt>
                <Txt
                  style={{ fontFamily: fonts.bodyBold, fontSize: 12, lineHeight: 16, marginTop: 2 }}
                  color={c.textSecondary}
                >
                  {hint}
                </Txt>
              </Pressable>
            );
          }

          let icon: string;
          let tile: string;
          let title: string;
          let sub: string;
          let pill: Pill | null;
          let open: () => void;
          if (card.kind === 'place') {
            icon = card.which === 'home' ? '🏠' : '💼';
            tile = card.which === 'home' ? brand.peachSoft : brand.mintSoft;
            title = t(card.which === 'home' ? 'home.quickHome' : 'home.quickWork');
            sub = card.sub;
            pill = card.pill;
            open = () =>
              router.push({
                pathname: '/sonuc',
                params: { lat: String(card.lat), lng: String(card.lng), label: card.sub },
              });
          } else if (card.kind === 'parking') {
            icon = '⭐';
            tile = '#E6EEF1';
            title = card.name;
            sub = t('home.quickParking');
            pill = card.pill;
            open = () => router.push({ pathname: '/otopark/[id]', params: { id: card.id } });
          } else {
            icon = '🍽️';
            tile = brand.peachSoft;
            title = card.name;
            sub = t('home.quickRestaurant');
            pill = card.pill;
            open = () => router.push({ pathname: '/restoran/[id]', params: { id: card.id } });
          }
          const colors = pill ? tone(pill.tone) : null;
          return (
            <Pressable
              key={card.key}
              accessibilityRole="button"
              accessibilityLabel={[title, sub, pill?.text].filter(Boolean).join(', ')}
              onPress={open}
              style={({ pressed }) => [
                asym(22, 6),
                {
                  width: 148,
                  minHeight: 104,
                  padding: 12,
                  backgroundColor: c.card,
                  opacity: pressed ? 0.85 : 1,
                  shadowColor: brand.navy,
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.07,
                  shadowRadius: 10,
                },
              ]}
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: tile,
                  marginBottom: 8,
                }}
              >
                <Txt allowFontScaling={false} style={{ fontSize: 18, lineHeight: 24 }}>
                  {icon}
                </Txt>
              </View>
              <Txt style={{ fontFamily: fonts.bodyExtraBold, fontSize: 15, lineHeight: 20 }}>
                {title}
              </Txt>
              <Txt
                style={{ fontFamily: fonts.bodyBold, fontSize: 12, lineHeight: 16, marginTop: 2 }}
                color={c.textSecondary}
              >
                {sub}
              </Txt>
              {pill && colors && (
                <View
                  style={{
                    alignSelf: 'flex-start',
                    marginTop: 6,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 999,
                    backgroundColor: colors.bg,
                  }}
                >
                  <Txt
                    style={{ fontFamily: fonts.bodyExtraBold, fontSize: 12, lineHeight: 16 }}
                    color={colors.fg}
                  >
                    {pill.text}
                  </Txt>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
