import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Txt } from '@/components/Txt';
import { cityExamples } from '@/data/cities';
import { useApp } from '@/store/app';
import { brand, fonts, HIT, useColors } from '@/theme';

const EXAMPLES = ['home.example1', 'home.example2', 'home.example3'] as const;

/** Opens the chat with a ready-made question. */
export function openChat(q: string) {
  router.push({ pathname: '/sohbet', params: { q } });
}

/**
 * Search card overlapping the hero. The "input" is a button that opens the
 * search screen; the locate button keeps today's "near me" action. Three
 * example questions open the chat directly.
 */
export function SearchCard() {
  const c = useColors();
  const { t } = useTranslation();
  // Re-render on a city switch: the example places follow the active city.
  useApp((s) => s.city);
  const examples = cityExamples();
  return (
    <View
      style={{
        marginTop: -34,
        marginHorizontal: 16,
        padding: 8,
        borderRadius: 22,
        backgroundColor: c.card,
        shadowColor: brand.navy,
        shadowOpacity: 0.16,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 12 },
        elevation: 6,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('home.a11ySearch')}
          onPress={() => router.push('/ara')}
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 46,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Icon name="search" size={20} color={c.textSecondary} strokeWidth={2.2} />
          <Txt
            numberOfLines={2}
            style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 21 }}
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
            width: 46,
            height: 46,
            borderRadius: 16,
            backgroundColor: c.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="locate" size={20} color={brand.navy} strokeWidth={2.4} />
        </Pressable>
      </View>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 6,
          paddingTop: 6,
          paddingHorizontal: 4,
        }}
      >
        {EXAMPLES.map((key, i) => {
          const text = t(key, examples);
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={t('home.a11yExample', { text })}
              hitSlop={{ top: (HIT - 34) / 2, bottom: (HIT - 34) / 2 }}
              onPress={() => openChat(text)}
              style={{
                minHeight: 34,
                paddingHorizontal: 10,
                borderRadius: 17,
                justifyContent: 'center',
                backgroundColor: i === 1 ? c.badgeFreshBg : c.badgeNearBg,
              }}
            >
              <Txt style={{ fontFamily: fonts.bodyBold, fontSize: 12, lineHeight: 16 }}>{text}</Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
