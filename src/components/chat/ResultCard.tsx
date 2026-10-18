import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Txt } from '@/components/Txt';
import type { ChatCard } from '@/data/assistant';
import { brand, fonts, HIT, useColors } from '@/theme';

import type { CardModel } from './model';
import { softShadow } from './style';

export const CARD_WIDTH = 226;

/** One carousel card: info area (opens the detail), then "Yol tarifi" and "Detay" buttons. */
export function ResultCard({
  card,
  model,
  onOpen,
  onDirections,
}: {
  card: ChatCard;
  model: CardModel;
  onOpen: (card: ChatCard) => void;
  onDirections: (card: ChatCard) => void;
}) {
  const c = useColors();
  const { t } = useTranslation();
  const badge =
    model.badge === 'picked'
      ? { text: t('chat.badgePicked'), bg: brand.mintSoft, fg: brand.mintText }
      : model.badge === 'easy'
        ? { text: t('chat.badgeEasy'), bg: c.badgeFreshBg, fg: c.badgeFreshText }
        : model.badge === 'likely'
          ? { text: t('chat.badgeLikely'), bg: c.badgeNearBg, fg: c.badgeNearText }
          : null;
  return (
    <View
      style={[
        { width: CARD_WIDTH, padding: 10, gap: 6, borderRadius: 18, backgroundColor: c.card },
        softShadow(0.08),
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={model.label}
        onPress={() => onOpen(card)}
        style={{ gap: 6, flexGrow: 1 }}
      >
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          {badge ? (
            <View
              style={{
                paddingVertical: 2,
                paddingHorizontal: 8,
                borderRadius: 9,
                backgroundColor: badge.bg,
              }}
            >
              <Txt
                color={badge.fg}
                style={{ fontFamily: fonts.bodyExtraBold, fontSize: 11, lineHeight: 15 }}
              >
                {badge.text}
              </Txt>
            </View>
          ) : (
            <View />
          )}
          <Txt secondary style={{ fontFamily: fonts.bodyBold, fontSize: 12, lineHeight: 16 }}>
            {model.distance}
          </Txt>
        </View>
        <Txt numberOfLines={2} style={{ fontFamily: fonts.display, fontSize: 16, lineHeight: 19 }}>
          {model.name}
        </Txt>
        {model.subline && (
          <Txt secondary numberOfLines={2} style={{ fontSize: 12, lineHeight: 16 }}>
            {model.subline}
          </Txt>
        )}
        {model.pill && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingVertical: 6,
              paddingHorizontal: 8,
              borderRadius: 10,
              backgroundColor: c.bg,
            }}
          >
            {model.pillMark && (
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 6,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: brand.mintSoft,
                }}
              >
                <Txt
                  allowFontScaling={false}
                  color={brand.mintText}
                  style={{ fontFamily: fonts.display, fontSize: 11, lineHeight: 14 }}
                >
                  P
                </Txt>
              </View>
            )}
            <Txt
              style={{ flexShrink: 1, fontFamily: fonts.bodyBold, fontSize: 12, lineHeight: 16 }}
            >
              {model.pill}
            </Txt>
          </View>
        )}
        {model.unverified && (
          <Txt secondary style={{ fontSize: 11, lineHeight: 14 }}>
            {t('food.unverified')}
          </Txt>
        )}
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('chat.directionsLabel', { name: card.name })}
          onPress={() => onDirections(card)}
          style={({ pressed }) => ({
            flex: 1,
            minHeight: HIT,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: c.accent,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Txt
            accessible={false}
            color={brand.navy}
            style={{ fontFamily: fonts.bodyExtraBold, fontSize: 12, lineHeight: 16 }}
          >
            {t('chat.directions')}
          </Txt>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('chat.detailLabel', { name: card.name })}
          onPress={() => onOpen(card)}
          style={({ pressed }) => ({
            flex: 1,
            minHeight: HIT,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1.5,
            borderColor: c.line,
            backgroundColor: pressed ? c.surface : c.card,
          })}
        >
          <Txt
            accessible={false}
            style={{ fontFamily: fonts.bodyExtraBold, fontSize: 12, lineHeight: 16 }}
          >
            {t('chat.detail')}
          </Txt>
        </Pressable>
      </View>
    </View>
  );
}
