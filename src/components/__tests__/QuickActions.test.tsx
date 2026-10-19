import '@/i18n';

import { render, screen } from '@testing-library/react-native';
import { changeLanguage, t } from 'i18next';

import { QuickActions } from '../home/QuickActions';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/components/FoodHome', () => ({ openFoodNearMe: jest.fn() }));

const card = (foodCount: number | null) => (
  <QuickActions nearby={{ nearestFree: null, nearestWalk: 9, foodCount }} />
);

afterEach(async () => {
  await changeLanguage('tr');
});

describe('the home "Yemek bul" card subtitle', () => {
  it('says how many places are nearby when the count is known', async () => {
    await render(card(12));
    expect(screen.getByText('yakında 12 yer')).toBeTruthy();
  });

  it('falls back to a neutral line when the count is not known', async () => {
    await render(card(null));
    expect(screen.getByText('Yakınındaki yerler')).toBeTruthy();
  });

  it('never mentions parking, in either language, with or without a count', async () => {
    for (const lang of ['tr', 'en']) {
      await changeLanguage(lang);
      for (const count of [null, 1, 12]) {
        const { unmount } = await render(card(count));
        const food = screen.getByLabelText(lang === 'tr' ? /yemek bul/i : /food/i);
        expect(food.props.accessibilityLabel).not.toMatch(/park/i);
        const sub = t(count == null ? 'home.foodPlaces' : 'home.foodPlacesCount', { count });
        expect(sub).not.toMatch(/park/i);
        expect(screen.getByText(sub)).toBeTruthy();
        await unmount();
      }
    }
  });

  it('reads well in English, singular and plural', async () => {
    await changeLanguage('en');
    expect(t('home.foodPlacesCount', { count: 1 })).toBe('1 place nearby');
    expect(t('home.foodPlacesCount', { count: 7 })).toBe('7 places nearby');
    expect(t('home.foodPlaces')).toBe('Places near you');
  });
});
