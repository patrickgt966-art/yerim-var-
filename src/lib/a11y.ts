import { useEffect, useState } from 'react';
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
 */
export function useAnnounce(message: string | null | undefined, delayMs = 0): void {
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => AccessibilityInfo.announceForAccessibility(message), delayMs);
    return () => clearTimeout(id);
  }, [message, delayMs]);
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
