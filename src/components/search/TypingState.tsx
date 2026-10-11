import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { matchRestaurants } from '@/components/FoodHome';
import { Icon } from '@/components/Icon';
import { Txt } from '@/components/Txt';
import type { LatLng } from '@/data/geo';
import { localPart, parseQuery } from '@/data/intent';
import { kindLabel, type Restaurant } from '@/data/restaurants';
import type { SearchHit } from '@/data/search';
import { useParkings } from '@/data/useParkings';
import { useAnnounce } from '@/lib/a11y';
import { usePlaceSearch } from '@/lib/usePlaceSearch';
import { brand, fonts, useColors } from '@/theme';

import { freeForHit } from './freeForHit';
import { Group, Row, SectionTitle, Tile } from './SearchBits';
import { understoodChips } from './understood';

const MAX_RESTAURANTS = 3;
const MAX_PLACES = 5;

function hitSubtitle(h: SearchHit, t: TFunction): string {
  return [
    t(`search.kind.${h.kind}`),
    h.subtitle ?? h.district,
    h.far ? t('search.outside') : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}

function restaurantSubtitle(r: Restaurant, t: TFunction): string {
  return [kindLabel(r.kind, t), r.address].filter(Boolean).join(' · ');
}

/**
 * What the screen shows while typing. Everything is computed from the deferred
 * text, so a block never disappears while it catches up with the text box.
 */
export function TypingState({
  query,
  onAsk,
  onPlace,
}: {
  /** The text in the box. */
  query: string;
  onAsk: (text: string) => void;
  onPlace: (target: LatLng, label: string) => void;
}) {
  const c = useColors();
  const { t } = useTranslation();
  const { hits, settled, deferredQuery } = usePlaceSearch(query, localPart);
  const parkings = useParkings().data?.parkings;

  const intent = useMemo(() => parseQuery(deferredQuery), [deferredQuery]);
  const chips = useMemo(
    () =>
      understoodChips(intent, deferredQuery, {
        cat: (cat) => t(`food.cats.${cat}`),
        nearMe: t('ara.nearMe'),
        parking: t('ara.parking'),
        exclude: (what) => t('ara.exclude', { what }),
      }),
    [intent, deferredQuery, t],
  );
  const restaurants = useMemo(
    () => matchRestaurants(deferredQuery, MAX_RESTAURANTS),
    [deferredQuery],
  );
  const places = hits.slice(0, MAX_PLACES);

  const count = restaurants.length + places.length;
  useAnnounce(
    query.trim().length >= 2 && settled
      ? count > 0
        ? t('a11y.suggestionCount', { count })
        : t('a11y.suggestionNone')
      : null,
    700,
    query.trim(),
  );

  const text = query.trim();
  return (
    <>
      {chips.length > 0 && (
        <View
          accessible
          accessibilityLabel={t('ara.a11yUnderstood', {
            items: chips.map((x) => x.label).join(', '),
          })}
          style={{
            marginTop: 14,
            marginHorizontal: 16,
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: 18,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            backgroundColor: c.hero,
          }}
        >
          <Txt
            color={brand.orangeLight}
            style={{ fontFamily: fonts.bodyExtraBold, fontSize: 12, lineHeight: 16 }}
          >
            {t('ara.understood')}
          </Txt>
          <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {chips.map((chip) => (
              <View
                key={chip.key}
                style={{
                  minHeight: 26,
                  paddingHorizontal: 9,
                  borderRadius: 13,
                  justifyContent: 'center',
                  backgroundColor: 'rgba(255,255,255,0.14)',
                }}
              >
                <Txt
                  color={c.onHero}
                  style={{ fontFamily: fonts.bodyBold, fontSize: 12, lineHeight: 16 }}
                >
                  {`${chip.emoji} ${chip.label}`}
                </Txt>
              </View>
            ))}
          </View>
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('ara.a11yAsk', { q: text })}
        onPress={() => onAsk(text)}
        style={({ pressed }) => ({
          marginTop: 10,
          marginHorizontal: 16,
          minHeight: 52,
          paddingHorizontal: 16,
          borderRadius: 18,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: c.accent,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Txt
          color={brand.navy}
          style={{ fontFamily: fonts.bodyExtraBold, fontSize: 15, lineHeight: 20 }}
        >
          {t('ara.ask')}
        </Txt>
        <Icon name="arrow" size={18} color={brand.navy} strokeWidth={2.6} />
      </Pressable>

      {restaurants.length > 0 && (
        <>
          <SectionTitle text={t('ara.food')} />
          <Group>
            {restaurants.map((r, i) => {
              const sub = restaurantSubtitle(r, t);
              return (
                <Row
                  key={r.id}
                  first={i === 0}
                  title={r.name}
                  subtitle={sub}
                  label={sub ? `${r.name}, ${sub}` : r.name}
                  onPress={() => router.push({ pathname: '/restoran/[id]', params: { id: r.id } })}
                  icon={
                    <Tile bg={c.badgeNearBg}>
                      <Icon name="cutlery" size={20} color={c.text} />
                    </Tile>
                  }
                />
              );
            })}
          </Group>
        </>
      )}

      {places.length > 0 && (
        <>
          <SectionTitle text={t('ara.place')} />
          <Group>
            {places.map((h, i) => {
              const sub = hitSubtitle(h, t);
              const free = parkings ? freeForHit(h, parkings) : null;
              return (
                <Row
                  key={`${i}-${h.name}-${h.lat}-${h.lng}`}
                  first={i === 0}
                  title={h.name}
                  subtitle={sub}
                  label={
                    free != null
                      ? `${h.name}, ${sub}, ${t('ara.a11yFree', { count: free })}`
                      : `${h.name}, ${sub}`
                  }
                  onPress={() => onPlace(h, h.name)}
                  icon={
                    h.kind === 'parking' ? (
                      <Tile bg={c.hero}>
                        <Txt
                          allowFontScaling={false}
                          color={brand.orange}
                          style={{ fontFamily: fonts.display, fontSize: 16, lineHeight: 20 }}
                        >
                          P
                        </Txt>
                      </Tile>
                    ) : (
                      <Tile bg={c.chipBg}>
                        <Icon name="pin" size={20} color={c.text} />
                      </Tile>
                    )
                  }
                  trailing={
                    free != null ? (
                      <View
                        style={{
                          paddingVertical: 4,
                          paddingHorizontal: 8,
                          borderRadius: 10,
                          backgroundColor: c.badgeFreshBg,
                        }}
                      >
                        <Txt
                          color={c.badgeFreshText}
                          style={{ fontFamily: fonts.bodyExtraBold, fontSize: 13, lineHeight: 18 }}
                        >
                          {t('ara.free', { count: free })}
                        </Txt>
                      </View>
                    ) : undefined
                  }
                />
              );
            })}
          </Group>
        </>
      )}
    </>
  );
}
