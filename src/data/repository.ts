import { IzmirOpenDataProvider } from './izmirProvider';
import { MockProvider } from './mockProvider';
import type { ParkingProvider, ParkingResult } from './types';

/**
 * Tries the primary provider and falls back to sample data on any error.
 * The fallback is always flagged so the UI can say "Örnek veri gösteriliyor".
 */
export async function loadParkings(
  primary: ParkingProvider = new IzmirOpenDataProvider(),
  fallback: ParkingProvider = new MockProvider(),
  signal?: AbortSignal,
): Promise<ParkingResult> {
  try {
    const parkings = await primary.list(signal);
    return { parkings, source: primary.source, fetchedAt: new Date().toISOString() };
  } catch (e) {
    const parkings = await fallback.list(signal);
    return {
      parkings,
      source: fallback.source,
      fetchedAt: new Date().toISOString(),
      fallbackReason: e instanceof Error ? e.message : String(e),
    };
  }
}
