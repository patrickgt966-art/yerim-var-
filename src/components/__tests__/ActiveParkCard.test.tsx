import '@/i18n';

import { render, screen } from '@testing-library/react-native';

import { ActiveParkCard } from '@/components/ActiveParkCard';
import type { ActivePark } from '@/store/app';

jest.mock('@/lib/reminders', () => ({
  REMINDER_CHOICES: [30, 60, 120, 180],
  scheduleParkReminder: jest.fn(),
}));

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
