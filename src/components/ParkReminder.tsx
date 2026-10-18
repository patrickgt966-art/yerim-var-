import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Pressable, View } from 'react-native';

import {
  earlyReminderText,
  REMINDER_CHOICES,
  reminderText,
  scheduleParkReminder,
} from '@/lib/reminders';
import { useNow } from '@/lib/useNow';
import { useApp, type ActivePark } from '@/store/app';
import { useColors } from '@/theme';

import { Chip } from './Chip';
import { Txt } from './Txt';

const clock = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** "Hatırlat: 30 dk · 1 sa · 2 sa · 3 sa", or the time it is set for with a cancel. */
export function ParkReminder({ active }: { active: ActivePark }) {
  const c = useColors();
  const { t } = useTranslation();
  const setParkReminder = useApp((s) => s.setParkReminder);
  const lastMin = useApp((s) => s.lastReminderMin);
  const setLastReminderMin = useApp((s) => s.setLastReminderMin);
  const [busy, setBusy] = useState(false);
  const now = useNow();
  const r = active.reminder;

  if (r && new Date(r.at).getTime() > now) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Txt variant="bodyBold">{t('park.reminderSet', { time: clock(r.at) })}</Txt>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('park.reminderCancelA11y')}
          onPress={() => setParkReminder(null)}
          hitSlop={8}
        >
          <Txt color={c.full} variant="bodyBold">
            {t('park.reminderCancel')}
          </Txt>
        </Pressable>
      </View>
    );
  }

  const choose = async (minutes: number) => {
    if (busy) return;
    setBusy(true);
    setLastReminderMin(minutes);
    const set = await scheduleParkReminder(
      minutes,
      reminderText(active, minutes, t),
      new Date(),
      earlyReminderText(active, t),
    );
    setBusy(false);
    if (set) {
      setParkReminder(set);
      return;
    }
    Alert.alert(t('park.reminderDeniedTitle'), t('park.reminderDenied'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('park.openSettings'), onPress: () => void Linking.openSettings() },
    ]);
  };

  return (
    <View style={{ gap: 6 }}>
      <Txt variant="caption" secondary>
        {t('park.reminderAsk')}
      </Txt>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        {/* The last choice comes first. */}
        {[...REMINDER_CHOICES]
          .sort((a, b) => Number(b === lastMin) - Number(a === lastMin))
          .map((m) => (
            <Chip
              key={m}
              selected={false}
              label={
                m < 60 ? t('park.inMinutes', { count: m }) : t('park.inHours', { count: m / 60 })
              }
              onPress={() => void choose(m)}
            />
          ))}
      </View>
    </View>
  );
}
