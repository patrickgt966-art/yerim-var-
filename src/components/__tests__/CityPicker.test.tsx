import '@/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { CityButton } from '../CityPicker';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

describe('CityPicker', () => {
  it('lists city names without data badges', async () => {
    await render(<CityButton />);
    await fireEvent.press(screen.getByRole('button', { name: /Şehir:/ }));
    expect(screen.getByText('Şehir seç')).toBeTruthy();
    expect(screen.getAllByText('Ankara').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Antalya').length).toBeGreaterThan(0);
    expect(screen.queryByText('Doluluk verisi var')).toBeNull();
    expect(screen.queryByText('Otopark konumları')).toBeNull();
  });
});
