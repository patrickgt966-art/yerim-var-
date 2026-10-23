import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { handOffQuestion } from '@/components/chat/handoff';
import { useCoachTarget } from '@/components/coach/registry';
import { Icon } from '@/components/Icon';
import { Txt } from '@/components/Txt';
import { cityExamples } from '@/data/cities';
import { useApp } from '@/store/app';
import { brand, fonts, HIT, useColors } from '@/theme';

const EXAMPLES = ['home.example1', 'home.example2', 'home.example3'] as const;

/** Opens the chat and asks a ready-made question. */
export function openChat(q: string) {
  handOffQuestion(q);
  router.push('/sohbet');
}

/**
 * The search box (design V5). The "input" is a button that opens the search
 * screen; the orange locate button keeps the "near me" action.
 */
export function SearchCard() {
  const c = useColors();
  const { t } = useTranslation();
  const coach = useCoachTarget('search');
  return (
    <View
      {...coach}
      style={{
        marginHorizontal: 16,
        padding: 6,
        paddingLeft: 14,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: c.peachLine,
        backgroundColor: c.card,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('home.a11ySearch')}
        onPress={() => router.push('/ara')}
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 48,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Icon name="search" size={22} color={c.textSecondary} strokeWidth={2.2} />
        <Txt
          numberOfLines={2}
          style={{ flex: 1, fontFamily: fonts.body, fontSize: 16, lineHeight: 21 }}
          color={c.textSecondary}
        >
          {t('home.searchPlaceholder')}
        </Txt>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('home.a11yLocate')}
        onPress={() => router.push({ pathname: '/sonuc', params: { near: '1' } })}
        style={{
          width: 52,
          height: 52,
          borderRadius: 16,
          backgroundColor: c.accent,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="locate" size={22} color={brand.navy} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

/** "Örnek sorular": closed by default so the home stays short; open, three questions for the chat. */
export function ExampleQuestions() {
  const c = useColors();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // Re-render on a city switch: the example places follow the active city.
  useApp((s) => s.city);
  const examples = cityExamples();
  return (
    <View
      style={{
        marginHorizontal: 16,
        marginTop: 12,
        borderTopWidth: 1,
        borderTopColor: c.peachLine,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={t('home.examplesToggle')}
        onPress={() => setOpen((o) => !o)}
        style={{ minHeight: HIT + 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}
      >
        <Icon name="sparkle" size={20} color={c.textSecondary} />
        <Txt style={{ flex: 1, fontFamily: fonts.body, fontSize: 15 }} color={c.textSecondary}>
          {t('home.examplesToggle')}
        </Txt>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Icon name="chevronDown" size={18} color={c.textSecondary} />
        </View>
      </Pressable>
      {open && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 6 }}>
          {EXAMPLES.map((key, i) => {
            const text = t(key, examples);
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={t('home.a11yExample', { text })}
                onPress={() => openChat(text)}
                style={{
                  minHeight: HIT - 4,
                  paddingHorizontal: 12,
                  borderRadius: 20,
                  justifyContent: 'center',
                  backgroundColor: i === 1 ? c.mintSoft : c.peachSoft,
                }}
              >
                <Txt style={{ fontFamily: fonts.bodyBold, fontSize: 13, lineHeight: 17 }}>
                  {text}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
