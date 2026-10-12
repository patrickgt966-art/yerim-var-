import { useAi } from '@/store/ai';

import { aiBaseUrl, createAiClient } from './client';

const MIN_GAP_MS = 60_000;

// Module state on purpose: not persisted, shared by every screen.
let lastRefresh = 0;
let activity = 0;

/** Call when an AI response (or failure) updated the store, so older quota reads are dropped. */
export function noteAiActivity(): void {
  activity += 1;
}

/**
 * Pulls the real remaining count from the server into the store. Throttled to one call per
 * minute unless `force`; does nothing without consent or a configured server, and an older
 * server without /quota is harmless (quota() resolves null).
 */
export async function refreshAiQuota({ force = false }: { force?: boolean } = {}): Promise<void> {
  const url = aiBaseUrl();
  const state = useAi.getState();
  if (!url || state.consent !== 'yes') return;
  const now = Date.now();
  if (!force && now - lastRefresh < MIN_GAP_MS) return;
  lastRefresh = now;
  const seen = activity;
  const remaining = await createAiClient(url).quota(state.deviceId);
  if (remaining !== null && seen === activity) useAi.getState().setRemaining(remaining);
}

/** Test helper. */
export function resetAiRefresh(): void {
  lastRefresh = 0;
  activity = 0;
}
