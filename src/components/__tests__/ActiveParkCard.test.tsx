import '@/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { ActiveParkCard } from '@/components/ActiveParkCard';
import { backToCar } from '@/lib/parkHere';
import { useApp, type ActivePark } from '@/store/app';

jest.mock('@/lib/reminders', () => ({
  REMINDER_CHOICES: [30, 60, 120, 180],
  scheduleParkReminder: jest.fn(),
}));

jest.mock('@/lib/parkHere', () => ({ backToCar: jest.fn() }));

const MOCK_NOW = Date.parse('2026-10-17T12:00:00Z');
jest.mock('@/lib/useNow', () => ({ useNow: () => MOCK_NOW }));

const park = (over: Partial<ActivePark>): ActivePark => ({
  parkingId: 'no-tariff-id',
  name: 'Alsancak Katlı',
  lat: 38.437,
  lng: 27.142,
  startedAt: new Date(MOCK_NOW - 42 * 60_000).toISOString(),
  hourly: null,
  ...over,
});

it('shows elapsed time, the estimated cost, the reminder chips and "Parkı bitir"', async () => {
  await render(<ActiveParkCard active={park({ hourly: 60 })} />);
  expect(screen.getByText('AKTİF PARK')).toBeTruthy();
  expect(screen.getByText('Alsancak Katlı')).toBeTruthy();
  expect(screen.getByText('42 dk')).toBeTruthy();
  expect(screen.getByText('Tahmini ücret')).toBeTruthy();
  expect(screen.getByText('~60 TL')).toBeTruthy();
  expect(screen.getByText('Arabana dönmeni hatırlatayım mı?')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Parkı bitir' })).toBeTruthy();
});

it('hides the cost block when the cost is unknown', async () => {
  await render(<ActiveParkCard active={park({})} />);
  expect(screen.getByText('Geçen süre')).toBeTruthy();
  expect(screen.queryByText('Tahmini ücret')).toBeNull();
});

it('asks "still parked?" instead of the reminder after 12 hours', async () => {
  await render(
    <ActiveParkCard
      active={park({ startedAt: new Date(MOCK_NOW - 13 * 3_600_000).toISOString() })}
    />,
  );
  expect(screen.getByText('Hâlâ park hâlinde misin?')).toBeTruthy();
  expect(screen.queryByText('Arabana dönmeni hatırlatayım mı?')).toBeNull();
});

it('offers "Arabama dön" in the normal and the stale state', async () => {
  const { unmount } = await render(<ActiveParkCard active={park({})} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Arabama dön' }));
  expect(backToCar).toHaveBeenCalledWith(expect.objectContaining({ name: 'Alsancak Katlı' }));
  await unmount();
  await render(
    <ActiveParkCard
      active={park({ startedAt: new Date(MOCK_NOW - 13 * 3_600_000).toISOString() })}
    />,
  );
  expect(screen.getByRole('button', { name: 'Arabama dön' })).toBeTruthy();
});

it('offers an undo for the first 10 minutes only, and it ends the park', async () => {
  useApp.setState({ active: park({}) });
  const fresh = park({ startedAt: new Date(Date.now() - 2 * 60_000).toISOString() });
  const { unmount } = await render(<ActiveParkCard active={fresh} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Yanlışlıkla mı? Geri al' }));
  expect(useApp.getState().active).toBeNull();
  await unmount();
  const older = park({ startedAt: new Date(Date.now() - 11 * 60_000).toISOString() });
  await render(<ActiveParkCard active={older} />);
  expect(screen.queryByRole('button', { name: 'Yanlışlıkla mı? Geri al' })).toBeNull();
});
