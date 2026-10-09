import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, View } from 'react-native';

import type { LatLng } from '@/data/geo';
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
  const here = await Promise.race([
    currentLocation(ask),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), LOCATION_TIMEOUT_MS)),
  ]);
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
      style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}
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
              asym(HIT / 2, 6),
              {
                minHeight: HIT,
                minWidth: 112,
                paddingHorizontal: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: selected ? '#FFFFFF' : 'rgba(255,255,255,0.14)',
              },
            ]}
          >
            <Txt
              variant="bodyBold"
              color={selected ? brand.navy : '#FFFFFF'}
              style={{ fontSize: 15 }}
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

/** Up to 5 restaurants whose name contains the query (min 2 characters). */
export function matchRestaurants(query: string, limit = 5): Restaurant[] {
  const q = fold(query.trim());
  if (q.length < 2) return [];
  if (!folded) folded = allRestaurants().map((r) => ({ r, key: fold(r.name) }));
  const starts: Restaurant[] = [];
  const inside: Restaurant[] = [];
  for (const x of folded) {
    if (x.key.startsWith(q)) starts.push(x.r);
    else if (x.key.includes(q)) inside.push(x.r);
    if (starts.length >= limit) break;
  }
  return [...starts, ...inside].slice(0, limit);
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
            <Txt variant="bodyBold" numberOfLines={1}>
              {r.name}
            </Txt>
            {sub !== '' && (
              <Txt variant="caption" secondary numberOfLines={1}>
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
              <ActivityIndicator color={brand.navy} />
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
