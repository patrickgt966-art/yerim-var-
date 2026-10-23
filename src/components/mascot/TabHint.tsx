import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { Txt } from '@/components/Txt';
import { useCoach, useCoachHydrated, type TabHintKey } from '@/store/coach';
import { fonts, HIT, useColors } from '@/theme';

import { HOP_IN } from './motion';
import { Mascot, type MascotPose } from './Mascot';

const POSES: Record<TabHintKey, MascotPose> = {
  favoriler: { eyes: 'happy', mouth: 'smile', prop: 'star' },
  profil: { eyes: 'open', mouth: 'open', arm: 'wave' },
};

/**
 * Yerim's one-line hint on a tab's first visit, inline under the title. Shown after the
 * first-launch tour, once: "Tamam" or leaving the tab marks it seen.
 */
export function TabHint({ tab }: { tab: TabHintKey }) {
  const { t } = useTranslation();
  const c = useColors();
  const reduce = useReducedMotion();
  const hydrated = useCoachHydrated();
  const tourDone = useCoach((s) => s.coachDone);
  // Decided when the tab opens, so the card stays put until the user leaves.
  const [open, setOpen] = useState(false);
  useFocusEffect(
    useCallback(() => {
      const show = hydrated && tourDone && !useCoach.getState().seenHints.includes(tab);
      setOpen(show);
      return () => {
        if (show) useCoach.getState().seeHint(tab);
      };
    }, [hydrated, tourDone, tab]),
  );
  if (!open) return null;

  const text = t(`coach.hint.${tab}`);
  return (
    <Animated.View
      entering={reduce ? undefined : HOP_IN}
      style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}
    >
      <Mascot size={72} {...POSES[tab]} />
      <View
        style={{
          flex: 1,
          marginBottom: 14,
          padding: 12,
          gap: 8,
          borderRadius: 18,
          borderBottomLeftRadius: 5,
          backgroundColor: c.card,
          borderWidth: 1,
          borderColor: c.peachLine,
        }}
      >
        <Txt style={{ fontSize: 14, lineHeight: 20 }}>{text}</Txt>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('coach.hintOk')}
          accessibilityHint={text}
          onPress={() => {
            useCoach.getState().seeHint(tab);
            setOpen(false);
          }}
          hitSlop={8}
          style={{ alignSelf: 'flex-start', minHeight: HIT - 8, justifyContent: 'center' }}
        >
          <Txt style={{ fontFamily: fonts.bodyExtraBold, fontSize: 14 }} color={c.accentStrong}>
            {t('coach.hintOk')}
          </Txt>
        </Pressable>
      </View>
    </Animated.View>
  );
}
