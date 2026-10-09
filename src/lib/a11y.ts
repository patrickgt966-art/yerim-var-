import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** True while VoiceOver / TalkBack is on. */
export function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((v) => alive && setOn(v));
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setOn);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return on;
}

/**
 * Speaks `message` when it changes to a new non-empty text (iOS does not read
 * text that appears on its own). `delayMs` debounces fast changes such as typing.
 * The same `key` (default: the message) is never spoken twice in a row.
 */
export function useAnnounce(
  message: string | null | undefined,
  delayMs = 0,
  key: string | undefined = message ?? undefined,
): void {
  // The last spoken key: a refetch that flips a flag off and on must not repeat it.
  const last = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!message || key === last.current) return;
    const id = setTimeout(() => {
      last.current = key;
      AccessibilityInfo.announceForAccessibility(message);
    }, delayMs);
    return () => clearTimeout(id);
  }, [message, delayMs, key]);
}

/** Colour-blind friendly word for an occupancy level; null when unknown. */
export function levelWord(
  level: 'plenty' | 'few' | 'full' | 'unknown',
  t: (key: string) => string,
): string | null {
  if (level === 'plenty') return t('a11y.levelPlenty');
  if (level === 'few') return t('a11y.levelFew');
  if (level === 'full') return t('a11y.levelFull');
  return null;
}
