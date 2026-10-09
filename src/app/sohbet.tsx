import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BotBubble, TypingBubble, UserBubble, type ChatMessage } from '@/components/ChatBits';
import { Icon } from '@/components/Icon';
import { ScreenHeader } from '@/components/ScreenHeader';
import {
  answer,
  emptyContext,
  refine,
  type AssistantDeps,
  type BotMessage,
  type ChatAction,
  type ChatContext,
} from '@/data/assistant';
import { isInIzmirArea } from '@/data/places';
import { staticParkings } from '@/data/staticParkings';
import { useParkings } from '@/data/useParkings';
import { aiBaseUrl, createAiClient, type AiResult } from '@/lib/ai/client';
import { HISTORY_LIMIT, type ChatTurn } from '@/lib/ai/protocol';
import { currentLocation } from '@/lib/location';
import { firstParam } from '@/lib/params';
import { resolvePlace } from '@/lib/usePlaceSearch';
import { useAi } from '@/store/ai';
import { asym, brand, fonts, HIT, useColors } from '@/theme';

/** Same quick location wait as the food home. */
const LOCATION_TIMEOUT_MS = 5000;

/** The server is authoritative for the daily quota: mirror it into the store. */
function trackAi<T>(r: AiResult<T>): AiResult<T> {
  const store = useAi.getState();
  if (r.ok) store.setRemaining(r.remaining);
  else if (r.reason === 'quota') store.markOut();
  return r;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export default function ChatScreen() {
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

  const deps = useMemo<AssistantDeps>(
    () => ({
      here: async () => {
        const loc = await currentLocation(false, LOCATION_TIMEOUT_MS);
        return loc && isInIzmirArea(loc) ? loc : null;
      },
      geocode: async (query) => {
        const r = await resolvePlace(query);
        return r.point ?? (r.hit ? { lat: r.hit.lat, lng: r.hit.lng } : null);
      },
      parkings,
      t: (key, opts) => t(key, opts),
      ai: aiClient
        ? {
            understand: async () => {
              const bound = aiMsgRef.current;
              const req = {
                ...bound,
                deviceId: useAi.getState().deviceId,
                section: ctxRef.current.section,
              };
              return trackAi(await aiClient.understand(req));
            },
            narrate: async (rest) => {
              const bound = aiMsgRef.current;
              const req = {
                ...rest,
                deviceId: useAi.getState().deviceId,
                messageId: bound.messageId,
                text: bound.text,
              };
              return trackAi(await aiClient.narrate(req));
            },
            quotaNotice: () => useAi.getState().noticeOnce(),
          }
        : undefined,
    }),
    [parkings, t, aiClient],
  );

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState('');
  const [ctx, setCtx] = useState<ChatContext>(() => emptyContext(section));
  const ctxRef = useRef(ctx);
  const typingRef = useRef(false);
  const idRef = useRef(0);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const started = useRef(false);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const nextId = () => `m${idRef.current++}`;
  /** One new id per user message, shared by its understand and narrate calls. */
  const bindAi = (text: string) => {
    aiMsgRef.current = {
      messageId: `u${Date.now().toString(36)}${idRef.current}`,
      text,
      history: messagesRef.current
        .slice(-HISTORY_LIMIT)
        .map((m) => ({ role: m.role, text: m.text })),
    };
  };
  const addUser = (text: string) =>
    setMessages((m) => [...m, { id: nextId(), role: 'user', text }]);
  const addBot = (reply: BotMessage) => {
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
      },
    ]);
    AccessibilityInfo.announceForAccessibility(reply.text);
  };

  const reply = async (
    produce: () => Promise<{ reply: BotMessage; ctx: ChatContext }>,
  ) => {
    typingRef.current = true;
    setTyping(true);
    try {
      const [res] = await Promise.all([produce(), wait(reduce ? 0 : 450)]);
      ctxRef.current = res.ctx;
      setCtx(res.ctx);
      addBot(res.reply);
    } catch {
      addBot({ text: t('chat.error'), cards: [], actions: [] });
    } finally {
      typingRef.current = false;
      setTyping(false);
    }
  };

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || typingRef.current) return;
    bindAi(text);
    addUser(text);
    await reply(() => answer(text, ctxRef.current, deps));
  };

  const onAction = (a: ChatAction) => {
    if (a.kind === 'say') return void send(a.text);
    if (a.kind === 'open') {
      return router.push({ pathname: a.pathname, params: a.params } as never);
    }
    if (typingRef.current) return;
    bindAi(a.label);
    addUser(a.label);
    void reply(() => refine(ctxRef.current, a.patch, deps));
  };

  const submitInput = () => {
    const text = input;
    if (!text.trim() || typingRef.current) return;
    setInput('');
    void send(text);
  };

  useEffect(() => {
    if (started.current || !q) return;
    started.current = true;
    void send(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
      style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 8 }}
    >
      <View style={{ paddingHorizontal: 20 }}>
        <ScreenHeader title={t('chat.title')} back />
      </View>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, gap: 10 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: !reduce })}
        renderItem={({ item }) =>
          item.role === 'user' ? (
            <UserBubble text={item.text} />
          ) : (
            <BotBubble message={item} onAction={onAction} />
          )
        }
        ListFooterComponent={typing ? <TypingBubble /> : null}
      />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 8),
          borderTopWidth: 1,
          borderTopColor: c.line,
          backgroundColor: c.bg,
        }}
      >
        <TextInput
          value={input}
          onChangeText={setInput}
          onSubmitEditing={submitInput}
          placeholder={t('chat.placeholder')}
          placeholderTextColor={c.textSecondary}
          accessibilityLabel={t('chat.placeholder')}
          returnKeyType="send"
          style={[
            asym(22, 6),
            {
              flex: 1,
              minHeight: HIT,
              paddingHorizontal: 14,
              fontFamily: fonts.body,
              fontSize: 16,
              color: c.text,
              backgroundColor: c.card,
              borderWidth: 1,
              borderColor: c.line,
            },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('chat.send')}
          onPress={submitInput}
          style={[
            asym(15, 5),
            {
              width: HIT,
              height: HIT,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: brand.navy,
            },
          ]}
        >
          <Icon name="arrow" size={20} color={brand.white} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
