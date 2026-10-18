import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  View,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BotBubble, TypingBubble, UserBubble, type ChatMessage } from '@/components/ChatBits';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { Composer } from '@/components/chat/Composer';
import { ConsentCard } from '@/components/chat/ConsentCard';
import { takeHandedOffQuestion } from '@/components/chat/handoff';
import { aiHistory, suggestions } from '@/components/chat/model';
import { ruleQuery } from '@/components/chat/ruleQuery';
import { Txt } from '@/components/Txt';
import {
  answer,
  emptyContext,
  pickFromCards,
  refine,
  type AssistantDeps,
  type BotMessage,
  type ChatAction,
  type ChatCard,
  type ChatContext,
  type PlanData,
} from '@/data/assistant';
import { activeCity, isInCityArea } from '@/data/cities';
import { appleMapsUrl } from '@/data/geo';
import { getRestaurant } from '@/data/restaurants';
import { staticParkings } from '@/data/staticParkings';
import { useParkings } from '@/data/useParkings';
import { aiBaseUrl, createAiClient, type AiResult } from '@/lib/ai/client';
import { type ChatTurn } from '@/lib/ai/protocol';
import { noteAiActivity, refreshAiQuota } from '@/lib/ai/refresh';
import { currentLocation } from '@/lib/location';
import { firstParam } from '@/lib/params';
import { resolvePlace } from '@/lib/usePlaceSearch';
import { useAi } from '@/store/ai';
import { useApp } from '@/store/app';
import { fonts, useColors } from '@/theme';

/** Same quick location wait as the food home. */
const LOCATION_TIMEOUT_MS = 5000;

/** Router failures in a row; the "AI did not answer" notice shows on the 1st, 4th, 7th ... */
let aiFailRun = 0;

/** The server is authoritative for the daily quota: mirror it into the store. */
function trackAi<T>(r: AiResult<T>): AiResult<T> {
  const store = useAi.getState();
  noteAiActivity();
  if (r.ok) aiFailRun = 0;
  if (r.ok) store.setRemaining(r.remaining);
  else if (r.reason === 'quota') store.markOut();
  else if (r.remaining !== undefined) store.setRemaining(r.remaining);
  // A timeout or network error: the server may or may not have charged (a timed-out message is
  // cancelled and refunded in the background), so ask it a moment later.
  else if (r.reason === 'error') setTimeout(() => void refreshAiQuota({ force: true }), 1500);
  return r;
}

/** "12:40" in the device's local time. */
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export default function ChatScreen() {
  // The thread holds cards and places of one city: another city starts it over (empty, and the
  // opening question is not asked again).
  const city = useApp((s) => s.city);
  const [openedIn] = useState(city);
  return <Chat key={city} first={city === openedIn} />;
}

function Chat({ first }: { first: boolean }) {
  const c = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const params = useLocalSearchParams<{ q?: string | string[]; section?: string | string[] }>();
  const q = firstParam(params.q)?.trim();
  const section = firstParam(params.section) === 'food' ? 'food' : 'park';

  const { data } = useParkings();
  const parkings = useMemo(
    () => (data?.parkings && data.parkings.length > 0 ? data.parkings : staticParkings()),
    [data],
  );

  // The AI layer is off (undefined) until a server URL is configured.
  const aiClient = useMemo(() => {
    const url = aiBaseUrl();
    return url ? createAiClient(url) : null;
  }, []);
  // What the AI calls of the current user message are bound to.
  const aiMsgRef = useRef<{ messageId: string; text: string; history: ChatTurn[] }>({
    messageId: '',
    text: '',
    history: [],
  });
  const messagesRef = useRef<ChatMessage[]>([]);
  const consent = useAi((s) => s.consent);
  const setConsent = useAi((s) => s.setConsent);
  // Re-evaluated on every store change, so it follows `used` and `day`.
  const left = useAi((s) => s.remaining());
  const aiOn = aiClient !== null && consent === 'yes';
  // Messages from before the consent are never sent to the AI, not even as history: it starts
  // at the first message after the user said yes (all of them when consent was given earlier).
  const aiFromRef = useRef(consent === 'yes' ? 0 : Infinity);

  const deps = useMemo<AssistantDeps>(
    () => ({
      here: async () => {
        const loc = await currentLocation(false, LOCATION_TIMEOUT_MS);
        return loc && isInCityArea(loc) ? loc : null;
      },
      geocode: async (query) => {
        const r = await resolvePlace(query);
        return r.point ?? (r.hit ? { lat: r.hit.lat, lng: r.hit.lng } : null);
      },
      parkings,
      // `{{city}}` in a text is the active city unless the caller sets it.
      t: (key, opts) => t(key, { city: activeCity().name, ...opts }),
      ai:
        aiClient && aiOn
          ? {
              // The router: every new message, first (one use; pick and plan share its message id).
              understand: async (_text, lastCards) => {
                const bound = aiMsgRef.current;
                const req = {
                  ...bound,
                  deviceId: useAi.getState().deviceId,
                  section: ctxRef.current.section,
                  ...(lastCards ? { lastCards } : {}),
                };
                return trackAi(await aiClient.understand(req));
              },
              usesLeft: () => useAi.getState().remaining(),
              // One id per user message: understand, pick and plan share one daily use.
              pick: async (rest) => {
                const req = {
                  ...rest,
                  deviceId: useAi.getState().deviceId,
                  messageId: aiMsgRef.current.messageId,
                };
                return trackAi(await aiClient.pick(req));
              },
              pickPark: async (rest) => {
                const req = {
                  ...rest,
                  deviceId: useAi.getState().deviceId,
                  messageId: aiMsgRef.current.messageId,
                };
                return trackAi(await aiClient.pickPark(req));
              },
              plan: async (rest) => {
                const req = {
                  ...rest,
                  deviceId: useAi.getState().deviceId,
                  messageId: aiMsgRef.current.messageId,
                };
                return trackAi(await aiClient.plan(req));
              },
              quotaNotice: () => useAi.getState().noticeOnce(),
              failNotice: () => aiFailRun++ % 3 === 0,
            }
          : undefined,
    }),
    [parkings, t, aiClient, aiOn],
  );

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typing, setTyping] = useState(false);
  /** The reply waits for the AI: the typing bubble says so. */
  const [thinking, setThinking] = useState(false);
  // A `q` in the link only fills the input (see the opening effect below).
  const [input, setInput] = useState(() => (first && q ? q : ''));
  const [ctx, setCtx] = useState<ChatContext>(() => emptyContext(section));
  const ctxRef = useRef(ctx);
  const typingRef = useRef(false);
  const idRef = useRef(0);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const started = useRef(false);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (consent !== 'yes') aiFromRef.current = Infinity;
    else if (aiFromRef.current === Infinity) aiFromRef.current = messagesRef.current.length;
  }, [consent]);

  // The keyboard covers the home indicator: no safe-area padding under the input while it is up.
  const [keyboardUp, setKeyboardUp] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardUp(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardUp(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Show the server's real count when the chat opens.
  useEffect(() => {
    void refreshAiQuota();
  }, []);

  const nextId = () => `m${idRef.current++}`;
  /** One new id per user message, shared by its understand, pick and plan calls. */
  const bindAi = (text: string) => {
    aiMsgRef.current = {
      messageId: `u${Date.now().toString(36)}${idRef.current}`,
      text,
      history: aiHistory(messagesRef.current, aiFromRef.current),
    };
  };
  const addUser = (text: string) =>
    setMessages((m) => [...m, { id: nextId(), role: 'user', text, at: Date.now() }]);
  const addBot = (reply: BotMessage, understood?: ChatContext) => {
    setMessages((m) => [
      ...m,
      {
        id: nextId(),
        role: 'bot',
        text: reply.text,
        cards: reply.cards,
        actions: reply.actions,
        sparkle: reply.sparkle,
        notice: reply.notice,
        plan: reply.plan,
        at: Date.now(),
        ...(understood ? { ctx: understood } : {}),
      },
    ]);
    AccessibilityInfo.announceForAccessibility(reply.text);
  };

  const reply = async (
    produce: () => Promise<{ reply: BotMessage; ctx: ChatContext }>,
    usesAi = true,
  ) => {
    typingRef.current = true;
    setTyping(true);
    setThinking(usesAi && aiOn && useAi.getState().remaining() > 0);
    try {
      const [res] = await Promise.all([produce(), wait(reduce ? 0 : 450)]);
      ctxRef.current = res.ctx;
      setCtx(res.ctx);
      addBot(res.reply, res.ctx);
    } catch {
      addBot({ text: t('chat.error'), cards: [], actions: [] });
    } finally {
      typingRef.current = false;
      setTyping(false);
      setThinking(false);
    }
  };

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || typingRef.current) return;
    // The user sees what they typed or tapped; a tapped ready-made phrase reaches the assistant
    // in the form its rules read.
    const query = ruleQuery(text);
    bindAi(query);
    addUser(text);
    await reply(() => answer(query, ctxRef.current, deps));
  };

  const onAction = (a: ChatAction) => {
    if (a.kind === 'say') return void send(a.text);
    if (a.kind === 'open') {
      return router.push({ pathname: a.pathname, params: a.params } as never);
    }
    if (typingRef.current) return;
    bindAi(a.label);
    addUser(a.label);
    if (a.kind === 'pick') {
      void reply(() => pickFromCards(a.cards, a.query, ctxRef.current, deps));
      return;
    }
    // A filter chip never calls the AI.
    void reply(() => refine(ctxRef.current, a.patch, deps), false);
  };

  const onPlanDirections = (dest: PlanData['dest']) => {
    Linking.openURL(appleMapsUrl({ lat: dest.lat, lng: dest.lng }, dest.name)).catch(() =>
      Alert.alert(t('chat.openFailed')),
    );
  };

  const onDirections = (card: ChatCard) => {
    const dest =
      card.kind === 'restaurant' ? getRestaurant(card.id) : parkings.find((p) => p.id === card.id);
    if (!dest) return;
    Linking.openURL(appleMapsUrl({ lat: dest.lat, lng: dest.lng }, dest.name)).catch(() =>
      Alert.alert(t('chat.openFailed')),
    );
  };

  const submitInput = () => {
    const text = input;
    if (!text.trim() || typingRef.current) return;
    setInput('');
    void send(text);
  };

  // A question handed over by the app is asked at once. A `q` in the link only fills the input:
  // a link from outside the app (yerimvar://sohbet?q=...) must never send a message by itself.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const handed = takeHandedOffQuestion();
    if (first && handed) void send(handed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const last = messages[messages.length - 1];
  const picks =
    !typing && last?.role === 'bot' && (last.cards?.length ?? 0) > 0
      ? suggestions(ctx, (key, opts) => t(key, opts))
      : [];
  const firstAt = messages[0]?.at;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
      style={{ flex: 1, backgroundColor: c.surface }}
    >
      <ChatHeader
        top={insets.top + 4}
        right={
          aiOn ? (
            <View
              accessible
              accessibilityLabel={t('chat.a11yAiLeft', { count: left })}
              style={{
                minHeight: 34,
                justifyContent: 'center',
                paddingHorizontal: 12,
                borderRadius: 17,
                backgroundColor: c.badgeInfoBg,
              }}
            >
              <Txt
                color={c.badgeInfoText}
                accessible={false}
                style={{ fontFamily: fonts.bodyExtraBold, fontSize: 13, lineHeight: 18 }}
              >
                {left > 0 ? t('chat.aiLeft', { count: left }) : t('chat.aiNone')}
              </Txt>
            </View>
          ) : null
        }
      />
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: 14, paddingBottom: 10, gap: 12 }}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            {firstAt != null && (
              <View
                style={{
                  alignSelf: 'center',
                  paddingVertical: 4,
                  paddingHorizontal: 10,
                  borderRadius: 10,
                  backgroundColor: c.chipBg,
                }}
              >
                <Txt
                  color={c.textSecondary}
                  style={{ fontFamily: fonts.bodyBold, fontSize: 11, lineHeight: 15 }}
                >
                  {t('chat.today', { time: clock(firstAt) })}
                </Txt>
              </View>
            )}
            {aiClient && consent === 'unknown' ? <ConsentCard onChoose={setConsent} /> : null}
          </View>
        }
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: !reduce })}
        renderItem={({ item, index }) =>
          item.role === 'user' ? (
            <UserBubble text={item.text} />
          ) : (
            <BotBubble
              message={item}
              onAction={onAction}
              onDirections={onDirections}
              onPlanDirections={onPlanDirections}
              showChips={index === messages.length - 1}
            />
          )
        }
        ListFooterComponent={typing ? <TypingBubble thinking={thinking} /> : null}
      />
      <Composer
        value={input}
        onChange={setInput}
        onSubmit={submitInput}
        suggestions={picks}
        onPick={(text) => void send(text)}
        bottom={keyboardUp ? 8 : Math.max(insets.bottom, 8)}
      />
    </KeyboardAvoidingView>
  );
}
