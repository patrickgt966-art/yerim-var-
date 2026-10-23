import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Mascot, type MascotPose } from '@/components/mascot/Mascot';
import { Txt } from '@/components/Txt';
import { asym, fonts, useColors } from '@/theme';

/** What the chat is doing, as Yerim sees it. */
export type ChatMood = 'idle' | 'watching' | 'thinking' | 'happy';

const SIZE = 58;
const POSES: Record<ChatMood, MascotPose> = {
  idle: { eyes: 'open', mouth: 'smile' },
  watching: { eyes: 'down', mouth: 'smile' },
  thinking: { eyes: 'up', mouth: 'o' },
  happy: { eyes: 'happy', mouth: 'open', arm: 'up' },
};

/**
 * Yerim sitting on the top edge of the chat's input, like a companion beside the conversation:
 * it blinks when idle, looks down at what you type, hops when you send (`hops` counts sends),
 * looks up and bobs with thinking dots while the answer is on its way, and cheers when places
 * come back. With few smart answers left it holds up the count. A tap fills in an example
 * question. Still (expressions only) with Reduce Motion.
 */
export function ChatMascot({
  typing,
  typed,
  sends,
  cheerKey,
  left,
  onTap,
}: {
  /** An answer is on its way. */
  typing: boolean;
  /** The input has text in it. */
  typed: boolean;
  /** How many messages the user sent: each one is a hop. */
  sends: number;
  /** Changes when a reply with places arrives: Yerim cheers for a moment. */
  cheerKey: string | null;
  /** Smart answers left today when the AI is on and they are running low; null otherwise. */
  left: number | null;
  onTap: () => void;
}) {
  const { t } = useTranslation();
  const c = useColors();
  const reduce = useReducedMotion();
  const [blink, setBlink] = useState(false);
  const [cheer, setCheer] = useState(false);
  const y = useSharedValue(0);

  useEffect(() => {
    if (!cheerKey) return;
    const on = setTimeout(() => setCheer(true), 0);
    const off = setTimeout(() => setCheer(false), 2400);
    return () => {
      clearTimeout(on);
      clearTimeout(off);
    };
  }, [cheerKey]);
  const mood: ChatMood = typing ? 'thinking' : cheer ? 'happy' : typed ? 'watching' : 'idle';

  // An occasional blink while nothing happens.
  useEffect(() => {
    if (mood !== 'idle' && mood !== 'watching') return;
    const id = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 140);
    }, 3200);
    return () => clearInterval(id);
  }, [mood]);

  // A hop on each send and when places come back; a slow bob while thinking.
  useEffect(() => {
    if (reduce) {
      y.value = 0;
      return;
    }
    const out = Easing.out(Easing.quad);
    const hop = [
      withTiming(-14, { duration: 150, easing: out }),
      withTiming(0, { duration: 260, easing: out }),
    ] as const;
    if (mood === 'thinking') {
      // The send's hop, then a slow bob until the answer comes.
      const ease = Easing.inOut(Easing.quad);
      y.value = withSequence(
        ...hop,
        withRepeat(
          withSequence(
            withTiming(-4, { duration: 420, easing: ease }),
            withTiming(0, { duration: 420, easing: ease }),
          ),
          -1,
          false,
        ),
      );
    } else if (mood === 'happy') {
      y.value = withSequence(...hop);
    } else {
      y.value = withTiming(0, { duration: 150 });
    }
  }, [mood, sends, reduce, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  const pose = POSES[mood];
  const eyes = blink && (mood === 'idle' || mood === 'watching') ? 'blink' : pose.eyes;
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        right: 14,
        bottom: '100%',
        flexDirection: 'row',
        alignItems: 'flex-end',
      }}
    >
      {mood === 'thinking' && (
        <View
          testID="thinking-dots"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 3,
            marginRight: 2,
            marginBottom: 44,
          }}
        >
          {[5, 7, 9].map((d) => (
            <View
              key={d}
              style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: c.textSecondary }}
            />
          ))}
        </View>
      )}
      {left != null && (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            asym(10, 3),
            {
              marginRight: 2,
              marginBottom: 30,
              paddingHorizontal: 8,
              paddingVertical: 3,
              backgroundColor: c.badgeInfoBg,
            },
          ]}
        >
          <Txt
            allowFontScaling={false}
            style={{ fontFamily: fonts.bodyExtraBold, fontSize: 11, lineHeight: 14 }}
            color={c.badgeInfoText}
          >
            {t('chat.mascotLeft', { count: left })}
          </Txt>
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('chat.mascotA11y')}
        accessibilityHint={t('chat.mascotHint')}
        onPress={onTap}
        hitSlop={6}
        style={{ marginBottom: -6 }}
      >
        <Animated.View style={style}>
          <Mascot size={SIZE} {...pose} eyes={eyes} />
        </Animated.View>
      </Pressable>
    </View>
  );
}
