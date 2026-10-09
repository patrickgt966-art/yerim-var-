import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { distanceMeters, type LatLng } from '@/data/geo';
import { isInIzmirArea, POPULAR_PLACES } from '@/data/places';
import {
  allRestaurants,
  FOOD_CATEGORIES,
  kindLabel,
  type FoodCategory,
  type Restaurant,
} from '@/data/restaurants';
import { fold } from '@/data/search';
import { currentLocation } from '@/lib/location';
import { asym, brand, fonts, HIT, useColors } from '@/theme';

import { CATEGORY_ICON } from './foodCategory';
import { Icon } from './Icon';
import { Txt } from './Txt';

export type HomeMode = 'park' | 'food';

/** Opens the restaurant list around a point. */
export function openFood(target: LatLng, label: string, cat?: FoodCategory) {
  router.push({
    pathname: '/restoranlar',
    params: { lat: String(target.lat), lng: String(target.lng), label, ...(cat ? { cat } : {}) },
  });
}

const FALLBACK = POPULAR_PLACES.find((p) => p.id === 'kordon') ?? POPULAR_PLACES[0]!;

const LOCATION_TIMEOUT_MS = 5000;

/** The user's location if known quickly and inside İzmir, else Kordon. */
async function foodCenter(
  ask: boolean,
  myLabel: string,
): Promise<{ target: LatLng; label: string }> {
  const here = await currentLocation(ask, LOCATION_TIMEOUT_MS);
  if (here && isInIzmirArea(here)) return { target: here, label: myLabel };
  return { target: FALLBACK, label: FALLBACK.name };
}

/** Around the user when location is already granted (or `ask`), else Kordon. */
export async function openFoodNearMe(label: string, cat?: FoodCategory, ask = false) {
  const { target, label: shown } = await foodCenter(ask, label);
  openFood(target, shown, cat);
}

/** Otopark / Restoran switch shown on the hero. */
export function ModeSwitch({
  mode,
  onChange,
}: {
  mode: HomeMode;
  onChange: (m: HomeMode) => void;
}) {
  const { t } = useTranslation();
  const options: { id: HomeMode; label: string }[] = [
    { id: 'park', label: t('food.modeOtopark') },
    { id: 'food', label: t('food.modeRestoran') },
  ];
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={t('food.modeLabel')}
      style={[
        asym(14, 4),
        { flexDirection: 'row', padding: 3, backgroundColor: 'rgba(255,255,255,0.10)' },
      ]}
    >
      {options.map((o) => {
        const selected = mode === o.id;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.id)}
            style={[
              asym(11, 3),
              {
                minHeight: HIT,
                paddingHorizontal: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: selected ? brand.white : 'transparent',
              },
            ]}
          >
            <Txt
              variant="bodyBold"
              color={selected ? brand.navy : brand.line}
              style={{ fontSize: 14 }}
            >
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

let folded: { r: Restaurant; key: string }[] | null = null;

/** Same-name chain branches kept in the suggestions (the nearest ones). */
const MAX_SAME_NAME = 2;

/**
 * Up to `limit` restaurants whose name contains the query (min 2 characters),
 * names that start with it first, each group nearest to `from` first (the
 * user, else the search target; Kordon when neither is known). A chain keeps
 * only its nearest branches.
 */
export function matchRestaurants(query: string, limit = 5, from: LatLng = FALLBACK): Restaurant[] {
  const q = fold(query.trim());
  if (q.length < 2) return [];
  if (!folded) folded = allRestaurants().map((r) => ({ r, key: fold(r.name) }));
  const starts: { r: Restaurant; d: number }[] = [];
  const inside: { r: Restaurant; d: number }[] = [];
  for (const x of folded) {
    const hit = x.key.startsWith(q) ? starts : x.key.includes(q) ? inside : null;
    if (hit) hit.push({ r: x.r, d: distanceMeters(from, x.r) });
  }
  const perName = new Map<string, number>();
  const out: Restaurant[] = [];
  for (const { r } of [starts, inside].flatMap((g) => g.sort((a, b) => a.d - b.d))) {
    const key = fold(r.name);
    const n = perName.get(key) ?? 0;
    if (n >= MAX_SAME_NAME) continue;
    perName.set(key, n + 1);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

/** Restaurant-name suggestions, shown above place suggestions. */
export function RestaurantSuggestions({ matches }: { matches: Restaurant[] }) {
  const c = useColors();
  const { t } = useTranslation();
  return (
    <>
      {matches.map((r, i) => {
        const sub = [kindLabel(r.kind, t), r.address].filter(Boolean).join(' · ');
        return (
          <Pressable
            key={r.id}
            accessibilityRole="button"
            accessibilityLabel={sub ? `${r.name}, ${sub}` : r.name}
            onPress={() => router.push({ pathname: '/restoran/[id]', params: { id: r.id } })}
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
              {r.name}
            </Txt>
            {sub !== '' && (
              <Txt variant="caption" secondary numberOfLines={2}>
                {sub}
              </Txt>
            )}
          </Pressable>
        );
      })}
    </>
  );
}

/** Large tappable category cards. */
export function CategoryGrid() {
  const c = useColors();
  const { t } = useTranslation();
  const [pending, setPending] = useState<FoodCategory | null>(null);

  const open = async (cat: FoodCategory) => {
    if (pending) return;
    setPending(cat);
    await openFoodNearMe(t('results.myLocation'), cat);
    setPending(null);
  };

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {FOOD_CATEGORIES.map((cat) => (
        <Pressable
          key={cat}
          accessibilityRole="button"
          accessibilityLabel={t('food.a11yCategory', { name: t(`food.cats.${cat}`) })}
          accessibilityState={{ busy: pending === cat }}
          onPress={() => open(cat)}
          style={[
            asym(22, 6),
            {
              flexBasis: '47%',
              flexGrow: 1,
              minHeight: 96,
              padding: 14,
              gap: 10,
              justifyContent: 'space-between',
              backgroundColor: c.card,
              borderWidth: 1,
              borderColor: c.line,
            },
          ]}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: brand.cream,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {pending === cat ? (
              <ActivityIndicator color={brand.navy} accessibilityLabel={t('a11y.loading')} />
            ) : (
              <Icon name={CATEGORY_ICON[cat]} size={24} color={brand.navy} />
            )}
          </View>
          <Txt style={{ fontFamily: fonts.display, fontSize: 17 }}>{t(`food.cats.${cat}`)}</Txt>
        </Pressable>
      ))}
    </View>
  );
}
