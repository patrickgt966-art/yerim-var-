import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Txt } from '@/components/Txt';
import type { ChatAction, ChatCard } from '@/data/assistant';
import { asym, brand, useColors } from '@/theme';

export type ChatMessage = {
  id: string;
  role: 'user' | 'bot';
  text: string;
  cards?: ChatCard[];
  actions?: ChatAction[];
  sparkle?: boolean;
  notice?: string;
};

export function UserBubble({ text }: { text: string }) {
  const { t } = useTranslation();
  return (
    <View
      style={[
        asym(20, 6),
        {
          alignSelf: 'flex-end',
          maxWidth: '85%',
          paddingVertical: 10,
          paddingHorizontal: 14,
          backgroundColor: brand.navy,
        },
      ]}
    >
      <Txt color={brand.white} accessibilityLabel={t('chat.a11yUser', { text })}>
        {text}
      </Txt>
    </View>
  );
}

function BotShell({ children }: { children: ReactNode }) {
  const c = useColors();
  return (
    <View
      style={[
        asym(20, 6),
        {
          alignSelf: 'flex-start',
          maxWidth: '92%',
          padding: 12,
          gap: 10,
          backgroundColor: c.card,
          borderWidth: 1,
          borderColor: c.line,
        },
      ]}
    >
      {children}
    </View>
  );
}

export function TypingBubble() {
  const { t } = useTranslation();
  return (
    <BotShell>
      <Txt accessibilityLabel={t('chat.typing')}>• • •</Txt>
    </BotShell>
  );
}

function CardView({ card }: { card: ChatCard }) {
  const c = useColors();
  const { t } = useTranslation();
  const distance = t('chat.distance', { km: (card.distanceM / 1000).toFixed(1) });
  let caption: string;
  if (card.kind === 'restaurant') {
    caption =
      (card.parkingM != null
        ? t('chat.parkingAt', { m: Math.round(card.parkingM) })
        : t('chat.noParkNear')) +
      ' · ' +
      distance +
      (card.unverified ? ' · ' + t('food.unverified') : '');
  } else {
    const count =
      card.free != null
        ? t('chat.freeCount', { count: card.free })
        : card.capacity != null
          ? t('chat.capacity', { count: card.capacity })
          : '';
    caption = count + (card.open === 'closed' ? ' · ' + t('chat.closed') : '') + ' · ' + distance;
  }
  const open = () =>
    card.kind === 'restaurant'
      ? router.push({ pathname: '/restoran/[id]', params: { id: card.id } })
      : router.push({ pathname: '/otopark/[id]', params: { id: card.id } });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${card.name}, ${caption}${card.kind === 'restaurant' && card.reason ? ', ' + card.reason : ''}`}
      onPress={open}
      style={({ pressed }) => [
        asym(14, 4),
        {
          minHeight: 52,
          paddingVertical: 8,
          paddingHorizontal: 12,
          justifyContent: 'center',
          backgroundColor: pressed ? c.surface : c.bg,
          borderWidth: 1,
          borderColor: c.line,
        },
      ]}
    >
      <Txt variant="bodyBold" numberOfLines={2}>
        {card.name}
      </Txt>
      <Txt variant="caption" secondary numberOfLines={2}>
        {caption}
      </Txt>
      {card.kind === 'restaurant' && card.reason && (
        <Txt variant="caption" secondary numberOfLines={2}>
          {card.reason}
        </Txt>
      )}
    </Pressable>
  );
}

export function BotBubble({
  message,
  onAction,
}: {
  message: ChatMessage;
  onAction: (a: ChatAction) => void;
}) {
  const c = useColors();
  const { t } = useTranslation();
  return (
    <BotShell>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Txt accessible={false} importantForAccessibility="no">
          🅿️
        </Txt>
        <View style={{ flexShrink: 1, gap: 2 }}>
          {message.sparkle && (
            <Txt variant="caption" secondary accessible={false} importantForAccessibility="no">
              {t('chat.sparkle')}
            </Txt>
          )}
          <Txt
            accessibilityLabel={
              (message.sparkle ? t('chat.sparkle') + '. ' : '') +
              t('chat.a11yBot', { text: message.text })
            }
          >
            {message.text}
          </Txt>
          {message.notice && (
            <Txt variant="caption" secondary>
              {message.notice}
            </Txt>
          )}
        </View>
      </View>
      {message.cards && message.cards.length > 0 && (
        <View style={{ gap: 8 }}>
          {message.cards.map((card) => (
            <CardView key={`${card.kind}-${card.id}`} card={card} />
          ))}
        </View>
      )}
      {message.actions && message.actions.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {message.actions.map((a, i) => (
            <Pressable
              key={`${i}-${a.label}`}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              onPress={() => onAction(a)}
              style={({ pressed }) => [
                asym(14, 4),
                {
                  minHeight: 44,
                  paddingHorizontal: 14,
                  justifyContent: 'center',
                  backgroundColor: pressed ? c.surface : c.card,
                  borderWidth: 1.5,
                  borderColor: brand.orange,
                },
              ]}
            >
              <Txt variant="bodyBold" style={{ fontSize: 14 }}>
                {a.label}
              </Txt>
            </Pressable>
          ))}
        </View>
      )}
    </BotShell>
  );
}
