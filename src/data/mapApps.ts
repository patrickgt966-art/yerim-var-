/** Map apps a directions hand-off can open. Kept apart so the store can import it without a cycle. */
export type MapApp = 'apple' | 'google' | 'yandex' | 'waze';

export const MAP_APPS: readonly MapApp[] = ['apple', 'google', 'yandex', 'waze'];

export function isMapApp(v: unknown): v is MapApp {
  return typeof v === 'string' && (MAP_APPS as readonly string[]).includes(v);
}
