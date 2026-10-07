import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNow } from '@/components/ActiveParkCard';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { PBadge } from '@/components/PBadge';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Row, Section } from '@/components/Section';
import { Txt } from '@/components/Txt';
import { estimateCost } from '@/data/tariffs';
import { durationText } from '@/lib/format';
import { useApp } from '@/store/app';
import { asym, fonts, HIT, useColors } from '@/theme';

function ActiveSection() {
  const { t } = useTranslation();
  const active = useApp((s) => s.active);
  const endPark = useApp((s) => s.endPark);
  const now = useNow(15_000);
  if (!active) {
    return (
      <Section title={t('favorites.activeTitle')}>
        <Txt secondary>{t('favorites.noActive')}</Txt>
      </Section>
    );
  }
  const elapsed = now - new Date(active.startedAt).getTime();
  const cost = estimateCost(active.hourly, elapsed / 60000);
  return (
    <Section title={t('favorites.activeTitle')}>
      <Txt style={{ fontFamily: fonts.display, fontSize: 20 }}>{active.name}</Txt>
      <Row label={t('favorites.elapsed')} value={durationText(elapsed, t)} />
      <Row label={t('favorites.estCost')} value={cost != null ? `₺${cost}` : t('common.unknown')} />
      <Button
        kind="danger"
        label={t('favorites.end')}
        onPress={() =>
          Alert.alert(t('favorites.end'), undefined, [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('favorites.end'), style: 'destructive', onPress: endPark },
          ])
        }
      />
    </Section>
  );
}

export default function FavoritesScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const favorites = useApp((s) => s.favorites);
  const toggleFavorite = useApp((s) => s.toggleFavorite);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingHorizontal: 20,
        paddingBottom: 32,
        gap: 14,
      }}
    >
      <ScreenHeader title={t('favorites.title')} />
      <ActiveSection />
      {favorites.length === 0 ? (
        <Txt secondary>{t('favorites.empty')}</Txt>
      ) : (
        favorites.map((f) => (
          <View
            key={f.id}
            style={[
              asym(22, 6),
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 12,
                backgroundColor: c.card,
                borderWidth: 1,
                borderColor: c.line,
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={f.name}
              onPress={() => router.push({ pathname: '/otopark/[id]', params: { id: f.id } })}
              style={{
                flex: 1,
                minHeight: HIT,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <PBadge size={32} />
              <Txt style={{ flex: 1, fontFamily: fonts.display, fontSize: 17 }}>{f.name}</Txt>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('favorites.a11yRemove', { name: f.name })}
              onPress={() => toggleFavorite(f)}
              style={{ width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="starFilled" color={c.accent} />
            </Pressable>
          </View>
        ))
      )}
    </ScrollView>
  );
}
