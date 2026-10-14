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
