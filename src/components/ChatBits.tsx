import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';

import { cardModel, understoodChips } from '@/components/chat/model';
import { PlanCard } from '@/components/chat/PlanCard';
import { ResultCard } from '@/components/chat/ResultCard';
import { BOT_INSET, softShadow } from '@/components/chat/style';
import { ThinkingBar, ThinkingSparkle } from '@/components/chat/ThinkingFx';
import { TypingDots } from '@/components/chat/TypingDots';
import { YAvatar } from '@/components/chat/YAvatar';
import { Txt } from '@/components/Txt';
import type { ChatAction, ChatCard, ChatContext, PlanData } from '@/data/assistant';
import { useAnnounce } from '@/lib/a11y';
import { brand, fonts, useColors } from '@/theme';

export type ChatMessage = {
  id: string;
  role: 'user' | 'bot';
  text: string;
  cards?: ChatCard[];
  actions?: ChatAction[];
  sparkle?: boolean;
  notice?: string;
  plan?: PlanData;
  /** Epoch ms the message was added (day chip). */
  at?: number;
  /** What the assistant understood when it wrote this reply. */
  ctx?: ChatContext;
};

export function UserBubble({ text }: { text: string }) {
  const { t } = useTranslation();
  return (
    <View
      style={{
        alignSelf: 'flex-end',
        marginHorizontal: 16,
        maxWidth: '76%',
        paddingVertical: 10,
        paddingHorizontal: 14,
        backgroundColor: brand.peachSoft,
        borderWidth: 1,
        borderColor: brand.peachLine,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 6,
        borderBottomRightRadius: 20,
        borderBottomLeftRadius: 20,
      }}
    >
      <Txt
        color={brand.navy}
        style={{ fontSize: 14, lineHeight: 20 }}
        accessibilityLabel={t('chat.a11yUser', { text })}
      >
        {text}
      </Txt>
    </View>
  );
}

const botCorners = {
  borderTopLeftRadius: 6,
  borderTopRightRadius: 20,
  borderBottomRightRadius: 20,
  borderBottomLeftRadius: 20,
} as const;

/**
 * What the bubble says while the AI works, and from when (ms): the text moves on as the wait
 * grows, so a slow answer reads as progress and never as frozen.
 */
const THINKING_STEPS = [
  { at: 0, key: 'chat.thinking' },
  { at: 2500, key: 'chat.thinkingSearch' },
  { at: 6000, key: 'chat.thinkingLong' },
  { at: 10000, key: 'chat.thinkingAlmost' },
] as const;

/** `thinking`: the reply waits for the AI; a sparkle, a changing line and a slow bar show it. */
export function TypingBubble({ thinking = false }: { thinking?: boolean }) {
  const { t } = useTranslation();
  const c = useColors();
  const [step, setStep] = useState(0);
  const [fade] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!thinking) return;
    const ids = THINKING_STEPS.slice(1).map((s, k) => setTimeout(() => setStep(k + 1), s.at));
    return () => ids.forEach(clearTimeout);
  }, [thinking]);
  useEffect(() => {
    if (step === 0) return;
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 280, useNativeDriver: true }).start();
  }, [step, fade]);
  // Spoken once, when the wait starts; the later text changes are not announced again.
  useAnnounce(thinking ? t('chat.thinking') : null);
  const label = thinking ? t(THINKING_STEPS[step]!.key) : t('chat.typing');
  if (!thinking) {
    return (
      <View
        accessible
        accessibilityLabel={label}
        style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 16 }}
      >
        <YAvatar />
        <View
          style={[
            botCorners,
            { paddingVertical: 14, paddingHorizontal: 14, backgroundColor: c.card },
            softShadow(),
          ]}
        >
          <TypingDots />
        </View>
      </View>
    );
  }
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 16 }}
    >
      <YAvatar />
      <View
        style={[
          botCorners,
          {
            minWidth: 220,
            maxWidth: '78%',
            paddingTop: 12,
            paddingBottom: 12,
            paddingHorizontal: 14,
            gap: 10,
            backgroundColor: c.card,
            borderWidth: 1,
            borderColor: c.chipBg,
          },
          softShadow(),
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <ThinkingSparkle />
          <Animated.View style={{ flexShrink: 1, opacity: fade }}>
            <Txt
              color={c.text}
              accessible={false}
              style={{ fontFamily: fonts.bodyBold, fontSize: 14, lineHeight: 19 }}
            >
              {label}
            </Txt>
          </Animated.View>
        </View>
        <ThinkingBar />
      </View>
    </View>
  );
}

function UnderstoodRow({ ctx, onAction }: { ctx: ChatContext; onAction: (a: ChatAction) => void }) {
  const c = useColors();
  const { t } = useTranslation();
  const chips = understoodChips(ctx, t);
  if (chips.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {chips.map((chip) => (
        <View
          key={chip.key}
          style={{
            minHeight: 24,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingLeft: 8,
            paddingRight: 2,
            borderRadius: 12,
            backgroundColor: c.chipBg,
          }}
        >
          <Txt
            color={c.textSecondary}
            style={{ fontFamily: fonts.bodyBold, fontSize: 11, lineHeight: 15 }}
          >
            {chip.text}
          </Txt>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('chat.chipDropLabel', { what: chip.what })}
            onPress={() => onAction(chip.drop)}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}
          >
            <Txt
              accessible={false}
              color={c.textSecondary}
              style={{ fontFamily: fonts.bodyBold, fontSize: 11, lineHeight: 14 }}
            >
              ✕
            </Txt>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

export function BotBubble({
  message,
  onAction,
  onDirections,
  onPlanDirections,
  showChips = false,
}: {
  message: ChatMessage;
  onAction: (a: ChatAction) => void;
  onDirections: (card: ChatCard) => void;
  onPlanDirections: (dest: PlanData['dest']) => void;
  /** Only the newest reply offers the "understood" chips; they act on the live context. */
  showChips?: boolean;
}) {
  const c = useColors();
  const { t } = useTranslation();
  const cards = message.cards ?? [];
  const actions = message.actions ?? [];
  const openCard = (card: ChatCard) =>
    card.kind === 'restaurant'
      ? router.push({ pathname: '/restoran/[id]', params: { id: card.id } })
      : router.push({ pathname: '/otopark/[id]', params: { id: card.id } });
  return (
    <View style={{ gap: 12 }}>
      <View
        style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 16 }}
      >
        <YAvatar />
        <View style={{ flexShrink: 1, gap: 6, minWidth: 0 }}>
          <View
            style={[
              botCorners,
              { paddingVertical: 10, paddingHorizontal: 12, backgroundColor: c.card },
              softShadow(),
            ]}
          >
            <Txt
              style={{ fontSize: 14, lineHeight: 20 }}
              accessibilityLabel={
                (message.sparkle ? t('chat.aiAnswer') + '. ' : '') +
                t('chat.a11yBot', { text: message.text })
              }
            >
              {message.text}
              {message.sparkle && (
                <Text
                  testID="ai-marker"
                  accessible={false}
                  importantForAccessibility="no"
                  style={{ fontSize: 11, lineHeight: 20, color: c.textSecondary }}
                >
                  {' ✨'}
                </Text>
              )}
            </Txt>
            {message.notice && (
              <Txt variant="caption" secondary style={{ marginTop: 4 }}>
                {message.notice}
              </Txt>
            )}
          </View>
          {showChips && message.ctx && cards.length > 0 && (
            <UnderstoodRow ctx={message.ctx} onAction={onAction} />
          )}
        </View>
      </View>
      {message.plan && <PlanCard plan={message.plan} onDirections={onPlanDirections} />}
      {cards.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            gap: 10,
            paddingLeft: BOT_INSET,
            paddingRight: 16,
            paddingBottom: 4,
          }}
        >
          {cards.map((card, i) => (
            <ResultCard
              key={`${card.kind}-${card.id}`}
              card={card}
              model={cardModel(card, i, message.ctx?.sort, t)}
              onOpen={openCard}
              onDirections={onDirections}
            />
          ))}
        </ScrollView>
      )}
      {actions.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            gap: 8,
            paddingLeft: BOT_INSET,
            paddingRight: 16,
            paddingVertical: 4,
          }}
        >
          {actions.map((a, i) => (
            <Pressable
              key={`${i}-${a.label}`}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              onPress={() => onAction(a)}
              hitSlop={{ top: 4, bottom: 4 }}
              style={({ pressed }) => ({
                minHeight: 36,
                paddingHorizontal: 12,
                borderRadius: 18,
                justifyContent: 'center',
                backgroundColor: pressed ? c.surface : c.card,
                borderWidth: 1.5,
                borderColor: brand.orangeLight,
              })}
            >
              <Txt
                accessible={false}
                style={{ fontFamily: fonts.bodyBold, fontSize: 13, lineHeight: 18 }}
              >
                {a.label}
              </Txt>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
