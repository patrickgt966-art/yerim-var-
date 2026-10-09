import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { hasRealTariffs } from '@/data/tariffs';
import { useParkings } from '@/data/useParkings';
import type { ParkMode } from '@/store/app';

import { Chip } from './Chip';

/**
 * "Şimdi" / "2 saat" switch. Hidden while no real car park has a tariff,
 * because the 2 hour estimate would say "Ücretli" for every one of them.
 */
export function ModeChips({ mode, onChange }: { mode: ParkMode; onChange: (m: ParkMode) => void }) {
  const { t } = useTranslation();
  const { data, isPlaceholderData } = useParkings();
  // The placeholder has no live records yet: neither hide the chips nor reset the mode.
  const hidden = !isPlaceholderData && (!data || !hasRealTariffs(data.parkings));
  // With the chips hidden nobody could switch back from "2 saat", so fall back to "Şimdi".
  useEffect(() => {
    if (data && !isPlaceholderData && hidden && mode !== 'now') onChange('now');
  }, [data, isPlaceholderData, hidden, mode, onChange]);
  if (hidden) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 12 }}>
      <Chip
        label={t('search.now')}
        icon="clock"
        selected={mode === 'now'}
        onPress={() => onChange('now')}
      />
      <Chip
        label={t('search.twoHours')}
        icon="hourglass"
        selected={mode === 'twoHours'}
        onPress={() => onChange('twoHours')}
      />
    </View>
  );
}
