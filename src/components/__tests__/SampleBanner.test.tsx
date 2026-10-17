import '@/i18n';

import { render, screen } from '@testing-library/react-native';

import { setActiveCity } from '@/data/cities';
import type { ParkingResult } from '@/data/types';
import { useApp } from '@/store/app';

import { SampleBanner } from '../SampleBanner';

const NOTE = "Ankara'da canlı boş yer verisi yok; otoparklar kapasite bilgisiyle gösteriliyor.";

const staticOnly = (fallbackReason?: string): ParkingResult => ({
  parkings: [],
  source: 'static-only',
  fetchedAt: new Date(0).toISOString(),
  ...(fallbackReason ? { fallbackReason } : {}),
});

afterEach(() => {
  setActiveCity('izmir');
  useApp.setState({ city: 'izmir' });
});

describe('SampleBanner in a city without a live parking API', () => {
  it('shows a calm note in Ankara, not an outage banner or an alert', async () => {
    useApp.getState().setCity('ankara');
    await render(<SampleBanner result={staticOnly()} />);
    expect(screen.getByText(NOTE)).toBeTruthy();
    expect(screen.queryByText(/ulaşılamıyor/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the same calm note in Bursa, with its own name', async () => {
    useApp.getState().setCity('bursa');
    await render(<SampleBanner result={staticOnly()} />);
    expect(
      screen.getByText(
        "Bursa'da canlı boş yer verisi yok; otoparklar kapasite bilgisiyle gösteriliyor.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/ulaşılamıyor/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the same calm note in Antalya, with its own name', async () => {
    useApp.getState().setCity('antalya');
    await render(<SampleBanner result={staticOnly()} />);
    expect(
      screen.getByText(
        "Antalya'da canlı boş yer verisi yok; otoparklar kapasite bilgisiyle gösteriliyor.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/ulaşılamıyor/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows nothing for fresh live data elsewhere, and still the outage text after a real failure', async () => {
    useApp.getState().setCity('istanbul');
    const { rerender } = await render(<SampleBanner result={staticOnly()} />);
    expect(screen.queryByText(NOTE)).toBeNull();
    expect(screen.queryByText(/canlı boş yer verisi yok/)).toBeNull();
    await rerender(<SampleBanner result={staticOnly('HTTP 503')} />);
    expect(screen.getByText(/Belediye verisine ulaşılamıyor/)).toBeTruthy();
  });
});
