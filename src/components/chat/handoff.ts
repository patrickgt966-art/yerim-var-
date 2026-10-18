/**
 * A question handed to the chat by the app itself (a tapped example, the search box). It is
 * kept in memory, not in the route: a link from outside the app (yerimvar://sohbet?q=...) can
 * only fill the input, never send a message by itself.
 */
let pending: { text: string; at: number } | null = null;

/** A handed-over question older than this belongs to a navigation that never happened. */
const MAX_AGE_MS = 10_000;

export function handOffQuestion(text: string): void {
  const q = text.trim();
  pending = q ? { text: q, at: Date.now() } : null;
}

/** The question to send on opening, once; null when the chat was opened any other way. */
export function takeHandedOffQuestion(now = Date.now()): string | null {
  const p = pending;
  pending = null;
  return p && now - p.at <= MAX_AGE_MS ? p.text : null;
}
