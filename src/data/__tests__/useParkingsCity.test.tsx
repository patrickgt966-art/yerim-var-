import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import { useApp } from '@/store/app';
import { cityById, isInCityArea, setActiveCity } from '../cities';
import { ISPARK_PARKING_URL } from '../isparkProvider';
import { IZMIR_PARKING_URL } from '../izmirProvider';
import { useParkings } from '../useParkings';

import izmirLive from './fixtures/izmir-live-2026-10-07.json';
import isparkSample from './fixtures/ispark-sample.json';

describe('useParkings follows the selected city', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    setActiveCity('izmir');
    useApp.setState({ city: 'izmir' });
  });

  it('downloads again from the other source when the city changes', async () => {
    await AsyncStorage.clear();
    const fetchMock = jest.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => (url === ISPARK_PARKING_URL ? isparkSample : izmirLive),
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    const { result, unmount } = await renderHook(() => useParkings(), { wrapper });

    await waitFor(() => expect(result.current.data?.source).toBe('izmir-open-data'));
    expect(fetchMock).toHaveBeenCalledWith(IZMIR_PARKING_URL, expect.anything());

    await act(async () => useApp.getState().setCity('istanbul'));
    await waitFor(() => expect(result.current.data?.source).toBe('ispark'));
    expect(fetchMock).toHaveBeenCalledWith(ISPARK_PARKING_URL, expect.anything());
    // The İstanbul list merges in the static OSM car parks; not a single İzmir record in it.
    const parkings = result.current.data?.parkings ?? [];
    const istanbul = cityById('istanbul');
    expect(parkings.every((p) => isInCityArea(p, istanbul))).toBe(true);
    expect(parkings.some((p) => p.source === 'ispark')).toBe(true);
    unmount();
    client.clear();
  });
});

describe('useParkings shows the saved result at once', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('renders the device cache marked fromCache while the slow live load runs, then swaps', async () => {
    await AsyncStorage.clear();
    // Saved by an earlier session: one car park, long ago (its counts are hidden by the age rule).
    const saved = {
      source: 'izmir-open-data',
      fetchedAt: '2026-10-22T10:00:00.000Z',
      parkings: [
        {
          id: 'saved-1',
          name: 'Saved Park',
          lat: 38.42,
          lng: 27.14,
          capacity: 100,
          free: 10,
          isIndoor: null,
          isOpen: null,
          isPaid: null,
          nonstop: null,
          openingHours: null,
          address: null,
          source: 'izmir-open-data',
          updatedAt: null,
          fetchedAt: '2026-10-22T10:00:00.000Z',
          occupancyKind: 'estimated',
        },
      ],
    };
    await AsyncStorage.setItem('parkings-cache-v1', JSON.stringify(saved));
    let answer: (v: unknown) => void = () => {};
    globalThis.fetch = jest.fn(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    ) as unknown as typeof fetch;
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    const { result, unmount } = await renderHook(() => useParkings(), { wrapper });

    // Saved data on screen before the live answer, flagged as waiting for it.
    await waitFor(() => expect(result.current.data?.fromCache).toBe(true));
    expect(result.current.data?.parkings.some((p) => p.id === 'saved-1')).toBe(true);
    expect(result.current.isFetching).toBe(true);

    await act(async () => {
      answer({ ok: true, status: 200, json: async () => izmirLive });
    });
    await waitFor(() => expect(result.current.data?.fromCache).toBeUndefined());
    expect(result.current.data?.parkings.some((p) => p.id === 'saved-1')).toBe(false);
    expect(result.current.data?.parkings.length).toBeGreaterThanOrEqual(izmirLive.length);
    unmount();
    client.clear();
  });

  it('shows no saved data for a city that has none', async () => {
    await AsyncStorage.clear();
    globalThis.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    const { result, unmount } = await renderHook(() => useParkings(), { wrapper });
    await act(async () => {});
    expect(result.current.data?.fromCache).toBeUndefined();
    expect(result.current.data?.source).toBe('static-only');
    unmount();
    client.clear();
  });
});
