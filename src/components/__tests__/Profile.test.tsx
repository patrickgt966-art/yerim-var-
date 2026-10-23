import '@/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import Profile from '@/app/(tabs)/profil';
import { useAi } from '@/store/ai';
import { useApp } from '@/store/app';
import { useAppearance } from '@/store/appearance';
import { useNudge } from '@/store/nudge';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/data/useParkings', () => ({
  useParkings: () => ({
    data: { parkings: [], source: 'izmir-open-data', fetchedAt: '2026-10-23T09:05:00Z' },
  }),
}));
jest.mock('@/lib/ai/client', () => ({ aiBaseUrl: () => 'https://ai.example' }));
// Yerim's first-visit hint animates with Reanimated; it has its own tests.
jest.mock('@/components/mascot/TabHint', () => ({ TabHint: () => null }));

beforeEach(() => {
  useApp.setState({ lang: 'auto', mapApp: null });
  useAi.setState({ consent: 'yes' });
});

describe('Profil', () => {
  it("turns Yerim's daily suggestion off and on", async () => {
    useNudge.getState().reset();
    await render(<Profile />);
    const toggle = screen.getByLabelText('Yerim arada bir selam versin');
    expect(toggle.props.value).toBe(true);
    await fireEvent(toggle, 'valueChange', false);
    expect(useNudge.getState().enabled).toBe(false);
  });

  it('lists the sections in order: Akıllı yardım, Yerim, Görünüm, Dil, Yol tarifi, Gizlilik, Veri kaynakları last', async () => {
    await render(<Profile />);
    const titles = screen.getAllByRole('header').map((h) => h.props.children);
    expect(titles).toEqual([
      'Profil',
      '✨ Akıllı yardım',
      'Yerim',
      'Görünüm',
      'Dil / Language',
      'Yol tarifi uygulaması',
      'Gizlilik',
      'Veri kaynakları',
    ]);
    expect(screen.getByText(/Bugün \d+ akıllı yardım hakkın kaldı/)).toBeTruthy();
  });

  it('names both jobs and keeps every licence in Veri kaynakları', async () => {
    await render(<Profile />);
    const body = screen.getByText(/^Restoranlar: /);
    const text = String(body.props.children);
    expect(text.indexOf('Restoranlar')).toBeLessThan(text.indexOf('Otoparklar'));
    for (const name of [
      'OpenStreetMap',
      'ODbL',
      'Overture Maps',
      'CDLA-Permissive-2.0',
      'İBB Açık Veri / İSPARK',
      'İzmir Büyükşehir Belediyesi Açık Veri Lisansı',
      'Yerim Var resmî bir belediye uygulaması değildir.',
    ])
      expect(text).toContain(name);
    expect(text).not.toMatch(/^Boş yer sayıları/);
    expect(screen.getByText(/^Son veri alma: \d\d:\d\d/)).toBeTruthy();
  });

  it('changes the directions app in the store', async () => {
    await render(<Profile />);
    await fireEvent.press(screen.getByLabelText('Apple Haritalar'));
    expect(useApp.getState().mapApp).toBe('apple');
    await fireEvent.press(screen.getByLabelText('Her seferinde sor'));
    expect(useApp.getState().mapApp).toBeNull();
  });

  it('picks the look: phone setting, light or dark', async () => {
    useAppearance.setState({ theme: 'auto' });
    await render(<Profile />);
    await fireEvent.press(screen.getByText('Koyu'));
    expect(useAppearance.getState().theme).toBe('dark');
    await fireEvent.press(screen.getByText('Açık'));
    expect(useAppearance.getState().theme).toBe('light');
  });

  it('changes the language in the store', async () => {
    await render(<Profile />);
    await fireEvent.press(screen.getByLabelText('English'));
    expect(useApp.getState().lang).toBe('en');
    await fireEvent.press(screen.getByLabelText("Phone's language"));
    expect(useApp.getState().lang).toBe('auto');
  });
});
