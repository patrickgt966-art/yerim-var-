import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { cityOfPlace } from '@/components/favoriteCity';
import { FreshnessBadge, StatusBadge, Tag } from '@/components/FreshnessBadge';
import { Icon } from '@/components/Icon';
import { SampleBanner } from '@/components/SampleBanner';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Row, Section } from '@/components/Section';
import { SlotStrip } from '@/components/SlotStrip';
import { tariffBandLabel, tariffSourceLabel } from '@/components/tariffLabel';
import { Txt } from '@/components/Txt';
import { getFreshness, occupancyLevel, visibleFree } from '@/data/freshness';
import { findAppleParking } from '@/data/appleParkings';
import { tariffFor } from '@/data/tariffs';
import type { OpeningHours } from '@/data/types';
import { useParkings } from '@/data/useParkings';
import { disabledInfo } from '@/lib/disabledSpots';
import { metaLine } from '@/lib/format';
import { openState } from '@/lib/openNow';
import { firstParam } from '@/lib/params';
import { directionsOnly, parkHere } from '@/lib/parkHere';
import { ReportPlace } from '@/components/ReportPlace';
import { reportWrongData } from '@/lib/report';
import { placeShareText, shareText } from '@/lib/share';
import { isStatic } from '@/lib/staticInfo';
import { useApp, useIsFavorite } from '@/store/app';
import { asym, fonts, HIT, statusTone, useColors } from '@/theme';

const DAY_ORDER: (keyof OpeningHours)[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export default function ParkingDetail() {
  const c = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string | string[] }>();
  // `?id=a&id=b` arrives as an array.
  const id = firstParam(params.id);
  const { data, isLoading, isPlaceholderData } = useParkings({ withHidden: true });
  const queryClient = useQueryClient();
  const p = data?.parkings.find((x) => x.id === id) ?? findAppleParking(queryClient, id ?? '');
  const isFav = useIsFavorite(id ?? '');
  const toggleFavorite = useApp((s) => s.toggleFavorite);
  const mode = useApp((s) => s.mode);
  const cityId = useApp((s) => s.city);
  const setCity = useApp((s) => s.setCity);
  // A saved car park of another city is not in this city's data: offer its city, no dead end.
  const savedFav = useApp((s) => s.favorites.find((f) => f.id === id));
  const savedIn = savedFav ? cityOfPlace(savedFav) : undefined;
  const otherCity = savedIn && savedIn.id !== cityId ? savedIn : undefined;

  if (!p) {
    return (
      <View
        style={{
          flex: 1,
          paddingTop: insets.top + 8,
          paddingHorizontal: 20,
          backgroundColor: c.bg,
        }}
      >
        <ScreenHeader title="" back />
        {isLoading || isPlaceholderData || !data ? (
          <ActivityIndicator color={c.text} accessibilityLabel={t('results.loading')} />
        ) : (
          <View style={{ gap: 12 }}>
            <Txt secondary>
              {otherCity
                ? t('favorites.otherCityBody', {
                    city: otherCity.name,
                    cityLoc: otherCity.locative,
                  })
                : t('detail.notFound')}
            </Txt>
            {otherCity && (
              <Button
                label={t('favorites.switchCity', { city: otherCity.name })}
                onPress={() => setCity(otherCity.id)}
              />
            )}
          </View>
        )}
      </View>
    );
  }

  const freshness = getFreshness(p);
  const free = visibleFree(p);
  const level = occupancyLevel(free, p.capacity);
  const disabled = disabledInfo(p);
  // When isOpen is false the meta line already says "Şu an kapalı".
  const maybeClosed =
    p.isOpen !== false && openState(p) === 'closed' ? t('results.maybeClosed') : null;
  const tariff = tariffFor(p.id);
  const official = tariff?.priceKind === 'official';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 8 }}>
      {/* Header stays fixed so "back" is always reachable while the page scrolls. */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 6 }}>
        <ScreenHeader
          title={p.name}
          back
          right={
            <View style={{ flexDirection: 'row' }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('share.a11y', { name: p.name })}
                onPress={() => void shareText(placeShareText(p, t))}
                style={{ width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="share" size={24} color={c.text} />
              </Pressable>
              {/* Apple results live only in memory, so a favourite would go stale. */}
              {p.source !== 'apple' && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={isFav ? t('detail.favoriteRemove') : t('detail.favoriteAdd')}
                  accessibilityState={{ selected: isFav }}
                  onPress={() => toggleFavorite({ id: p.id, name: p.name, lat: p.lat, lng: p.lng })}
                  style={{
                    width: HIT,
                    height: HIT,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon
                    name={isFav ? 'starFilled' : 'star'}
                    size={26}
                    color={isFav ? c.accentStrong : c.text}
                  />
                </Pressable>
              )}
            </View>
          }
        />
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 32,
          gap: 14,
        }}
      >
        <Txt
          secondary
          accessibilityLabel={[metaLine(p, t, mode, true), maybeClosed, p.operator, p.address]
            .filter(Boolean)
            .join(' · ')}
        >
          {[metaLine(p, t, mode), maybeClosed, p.operator, p.address].filter(Boolean).join(' · ')}
        </Txt>
        <SampleBanner result={data} />

        {isStatic(p) ? (
          <View style={[asym(18, 5), { backgroundColor: c.badgeInfoBg, padding: 14, gap: 6 }]}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <Txt variant="bodyBold" color={c.badgeInfoText} style={{ flex: 1 }}>
                {t('detail.staticTitle')}
              </Txt>
              {p.capacity != null && (
                <View style={{ alignItems: 'flex-end' }}>
                  <Txt
                    style={{ fontFamily: fonts.display, fontSize: 30, lineHeight: 34 }}
                    color={c.badgeInfoText}
                  >
                    {String(p.capacity)}
                  </Txt>
                  <Txt variant="label" color={c.badgeInfoText}>
                    {t('card.capacityUnit')}
                  </Txt>
                </View>
              )}
            </View>
            <Txt variant="caption" color={c.badgeInfoText}>
              {p.source === 'izelman'
                ? t('detail.staticBodyMunicipal')
                : p.source === 'apple'
                  ? t('detail.staticBodyApple')
                  : t('detail.staticBodyMapped')}
            </Txt>
          </View>
        ) : (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <View style={{ gap: 8, flex: 1 }}>
              {/* The status pill says the level in words as well as colour, for colour-blind users. */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                <StatusBadge level={level} free={free} />
                {freshness.kind !== 'unknown' && <FreshnessBadge freshness={freshness} />}
              </View>
              <SlotStrip free={free} capacity={p.capacity} />
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Txt
                style={{
                  fontFamily: fonts.display,
                  fontSize: free == null ? 20 : 44,
                  lineHeight: free == null ? 26 : 48,
                }}
                color={statusTone(level).fg}
              >
                {free == null ? t('common.unknown') : String(free)}
              </Txt>
              <Txt variant="label" secondary>
                {t('common.free')}
              </Txt>
            </View>
          </View>
        )}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Button
            label={t('results.parkHere')}
            onPress={() => parkHere(p)}
            style={{ flexGrow: 1, flexBasis: 150 }}
          />
          <Button
            label={t('results.directionsOnly')}
            kind="secondary"
            onPress={() => void directionsOnly(p)}
            style={{ minWidth: 96 }}
          />
        </View>

        <Section
          title={t('detail.tariff')}
          right={
            tariff ? (
              <Tag
                text={official ? t('detail.official') : t('detail.estimated')}
                bg={official ? c.badgeFreshBg : c.badgeNearBg}
                fg={official ? c.badgeFreshText : c.badgeNearText}
              />
            ) : undefined
          }
        >
          {tariff ? (
            <>
              {tariff.bands.map((b) => (
                <Row key={b.label} label={tariffBandLabel(b.label, t)} value={`₺${b.price}`} />
              ))}
              {!!tariff.monthly && <Row label={t('detail.monthly')} value={`₺${tariff.monthly}`} />}
              {!!tariff.freeMinutes && (
                <Txt variant="bodyBold" color={c.plenty}>
                  {t('detail.freeMinutes', { count: tariff.freeMinutes })}
                </Txt>
              )}
              <Txt variant="caption" secondary>
                {t('detail.tariffSource', { source: tariffSourceLabel(tariff.source, t) })}
              </Txt>
            </>
          ) : (
            <Txt secondary>{t('detail.noTariff')}</Txt>
          )}
        </Section>

        <Section title={t('detail.hours')}>
          {p.nonstop ? (
            <Txt variant="bodyBold" accessibilityLabel={t('common.a11yNonstop')}>
              {t('common.nonstop')}
            </Txt>
          ) : p.openingHours && Object.keys(p.openingHours).length > 0 ? (
            DAY_ORDER.filter((d) => p.openingHours?.[d]).map((d) => (
              <Row key={d} label={t(`detail.days.${d}`)} value={p.openingHours?.[d] ?? ''} />
            ))
          ) : p.openingHoursText ? (
            <Txt>{p.openingHoursText}</Txt>
          ) : (
            <Txt secondary>{t('common.unknown')}</Txt>
          )}
        </Section>

        <Section title={t('detail.capacity')}>
          <Txt variant="bodyBold">
            {p.capacity != null
              ? t('detail.capacityValue', { count: p.capacity })
              : t('common.unknown')}
          </Txt>
          {disabled && (
            <Txt variant="bodyBold">
              {disabled.kind === 'count'
                ? t('a11y.disabledCount', { free: disabled.free, capacity: disabled.capacity })
                : t('a11y.disabledExists')}
            </Txt>
          )}
        </Section>

        <Section title={t('detail.source')}>
          <Txt>
            {p.source === 'mock'
              ? t('detail.sourceMock')
              : p.source === 'osm'
                ? t('detail.sourceOsm')
                : p.source === 'izelman'
                  ? t(p.id.startsWith('bursa-bb-') ? 'detail.sourceBursa' : 'detail.sourceIzelman')
                  : p.source === 'apple'
                    ? t('detail.sourceApple')
                    : p.source === 'ispark'
                      ? t('detail.sourceIspark')
                      : t('detail.sourceIzmir')}
          </Txt>
        </Section>

        <ReportPlace
          placeId={p.id}
          place="parking"
          name={p.name}
          label={t('detail.report')}
          onDetails={() => void reportWrongData(p)}
        />
      </ScrollView>
    </View>
  );
}
