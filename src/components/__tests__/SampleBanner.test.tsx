import '@/i18n';

import { render, screen } from '@testing-library/react-native';

import { setActiveCity } from '@/data/cities';
import type { ParkingResult } from '@/data/types';
import { useApp } from '@/store/app';

import { SampleBanner } from '../SampleBanner';

const NOTE =
  "Ankara'da canlı boş yer sayısı yok, baştan söyleyeyim; otoparkları kapasiteleriyle gösteriyorum.";

const staticOnly = (fallbackReason?: string): ParkingResult => ({
  parkings: [],
  source: 'static-only',
  fetchedAt: new Date(0).toISOString(),
  ...(fallbackReason ? { fallbackReason } : {}),
});

const cached = (over: Partial<ParkingResult> = {}): ParkingResult => ({
  parkings: [],
  source: 'izmir-open-data',
  fetchedAt: '2026-10-24T08:30:00.000Z',
  ...over,
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
    expect(screen.queryByText(/ulaşamadım/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the same calm note in Bursa, with its own name', async () => {
    useApp.getState().setCity('bursa');
    await render(<SampleBanner result={staticOnly()} />);
    expect(
      screen.getByText(
        "Bursa'da canlı boş yer sayısı yok, baştan söyleyeyim; otoparkları kapasiteleriyle gösteriyorum.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/ulaşamadım/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the same calm note in Antalya, with its own name', async () => {
    useApp.getState().setCity('antalya');
    await render(<SampleBanner result={staticOnly()} />);
    expect(
      screen.getByText(
        "Antalya'da canlı boş yer sayısı yok, baştan söyleyeyim; otoparkları kapasiteleriyle gösteriyorum.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/ulaşamadım/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows nothing for fresh live data elsewhere, and still the outage text after a real failure', async () => {
    useApp.getState().setCity('istanbul');
    const { rerender } = await render(<SampleBanner result={staticOnly()} />);
    expect(screen.queryByText(NOTE)).toBeNull();
    expect(screen.queryByText(/canlı boş yer sayısı yok/)).toBeNull();
    await rerender(<SampleBanner result={staticOnly('HTTP 503')} />);
    expect(screen.getByText(/Belediye verisine ulaşamadım/)).toBeTruthy();
  });
});

describe('SampleBanner when the city source does not answer', () => {
  it('names the source and never says there is no internet (İzmir)', async () => {
    useApp.getState().setCity('izmir');
    await render(
      <SampleBanner result={cached({ offline: true, fallbackReason: 'Zaman aşımı (45 sn)' })} />,
    );
    expect(
      screen.getByText(
        /^İzmir Büyükşehir verisi şu an gelmiyor; son bilgi \d\d:\d\d \(.+ önce\)\. Eski sayıları gizledim\.$/,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/nternet/)).toBeNull();
  });

  it('names İSPARK for İstanbul', async () => {
    useApp.getState().setCity('istanbul');
    await render(
      <SampleBanner
        result={cached({ source: 'ispark', offline: true, fallbackReason: 'HTTP 503' })}
      />,
    );
    expect(screen.getByText(/^İSPARK verisi şu an gelmiyor/)).toBeTruthy();
  });

  it('shows the same text as a small muted line, not a warning card, when asked to', async () => {
    await render(
      <SampleBanner muted result={cached({ offline: true, fallbackReason: 'HTTP 503' })} />,
    );
    expect(screen.getByText(/verisi şu an gelmiyor/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('SampleBanner while saved data waits for the live load', () => {
  it('shows a calm Güncelleniyor… line, not an alert', async () => {
    await render(<SampleBanner result={cached({ fromCache: true })} />);
    expect(screen.getByText('Güncelleniyor…')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/gelmiyor|nternet/)).toBeNull();
  });

  it('is gone for the live result, and a screen with its own line can switch it off', async () => {
    const { rerender } = await render(<SampleBanner result={cached({ fromCache: true })} />);
    await rerender(<SampleBanner result={cached()} />);
    expect(screen.queryByText('Güncelleniyor…')).toBeNull();
    await rerender(<SampleBanner updating={false} result={cached({ fromCache: true })} />);
    expect(screen.queryByText('Güncelleniyor…')).toBeNull();
  });
});
