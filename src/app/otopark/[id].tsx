import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { FreshnessBadge, Tag } from '@/components/FreshnessBadge';
import { Icon } from '@/components/Icon';
import { SampleBanner } from '@/components/SampleBanner';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Row, Section } from '@/components/Section';
import { SlotStrip } from '@/components/SlotStrip';
import { Txt } from '@/components/Txt';
import { getFreshness, visibleFree } from '@/data/freshness';
import { tariffFor } from '@/data/tariffs';
import type { OpeningHours } from '@/data/types';
import { useParkings } from '@/data/useParkings';
import { metaLine } from '@/lib/format';
import { parkHere } from '@/lib/parkHere';
import { reportWrongData } from '@/lib/report';
import { useApp, useIsFavorite } from '@/store/app';
import { fonts, HIT, useColors } from '@/theme';

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
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data } = useParkings();
  const p = data?.parkings.find((x) => x.id === id);
  const isFav = useIsFavorite(id ?? '');
  const toggleFavorite = useApp((s) => s.toggleFavorite);
  const mode = useApp((s) => s.mode);

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
        <Txt secondary>{t('detail.notFound')}</Txt>
      </View>
    );
  }

  const freshness = getFreshness(p);
  const free = visibleFree(p);
  const tariff = tariffFor(p.id);
  const official = tariff?.priceKind === 'official';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + 8,
        paddingHorizontal: 20,
        paddingBottom: insets.bottom + 32,
        gap: 14,
      }}
    >
      <ScreenHeader
        title={p.name}
        back
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isFav ? t('detail.favoriteRemove') : t('detail.favoriteAdd')}
            accessibilityState={{ selected: isFav }}
            onPress={() => toggleFavorite({ id: p.id, name: p.name, lat: p.lat, lng: p.lng })}
            style={{ width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon
              name={isFav ? 'starFilled' : 'star'}
              size={26}
              color={isFav ? c.accent : c.text}
            />
          </Pressable>
        }
      />
      <Txt secondary>
        {[metaLine(p, t, mode), p.operator, p.address].filter(Boolean).join(' · ')}
      </Txt>
      <SampleBanner result={data} />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <View style={{ gap: 8, flex: 1 }}>
          <FreshnessBadge freshness={freshness} />
          <SlotStrip free={free} capacity={p.capacity} />
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Txt
            style={{
              fontFamily: fonts.display,
              fontSize: free == null ? 20 : 44,
              lineHeight: free == null ? 26 : 48,
            }}
          >
            {free == null ? t('common.unknown') : String(free)}
          </Txt>
          <Txt variant="label" secondary>
            {t('common.free')}
          </Txt>
        </View>
      </View>

      <Button label={t('results.parkHere')} onPress={() => parkHere(p)} />

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
              <Row key={b.label} label={b.label} value={`₺${b.price}`} />
            ))}
            <Txt variant="caption" secondary>
              {t('detail.tariffSource', { source: tariff.source })}
            </Txt>
          </>
        ) : (
          <Txt secondary>{t('detail.noTariff')}</Txt>
        )}
      </Section>

      <Section title={t('detail.hours')}>
        {p.nonstop ? (
          <Txt variant="bodyBold">{t('common.nonstop')}</Txt>
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
      </Section>

      <Section title={t('detail.source')}>
        <Txt>
          {p.source === 'mock'
            ? t('detail.sourceMock')
            : p.source === 'osm'
              ? t('detail.sourceOsm')
              : p.source === 'izelman'
                ? t('detail.sourceIzelman')
                : t('detail.sourceIzmir')}
        </Txt>
      </Section>

      <Button
        kind="secondary"
        label={t('detail.report')}
        accessibilityLabel={`${t('detail.report')}: ${p.name}`}
        onPress={() => void reportWrongData(p)}
      />
    </ScrollView>
  );
}
