import '@/i18n';

import { render, screen } from '@testing-library/react-native';
import { changeLanguage, t } from 'i18next';

import { QuickActions } from '../home/QuickActions';
import { NO_TICKET_FACTS, type TicketFacts } from '../home/ticketFacts';
import type { NearbyHome } from '../home/useNearbyHome';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/components/FoodHome', () => ({ openFoodNearMe: jest.fn() }));

jest.mock('react-native-reanimated', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    useReducedMotion: () => true,
    useSharedValue: (v: number) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withRepeat: (v: unknown) => v,
    withTiming: (v: unknown) => v,
  };
});

const card = (foodCount: number | null) => (
  <QuickActions nearby={{ nearestFree: null, nearestWalk: 9, foodCount }} />
);

afterEach(async () => {
  await changeLanguage('tr');
});

describe('the home "Yemek bul" card subtitle', () => {
  it('says how many places are nearby when the count is known', async () => {
    await render(card(12));
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('yer yakında')).toBeTruthy();
    expect(screen.getByLabelText('Yakınımda yemek bul, yakında 12 yer')).toBeTruthy();
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
        expect(food.props.accessibilityLabel).toContain(sub);
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

describe('the two tickets never look empty', () => {
  const tickets = (over: Partial<TicketFacts>): TicketFacts => ({ ...NO_TICKET_FACTS, ...over });
  const show = (
    over: Partial<TicketFacts>,
    extra: Partial<Pick<NearbyHome, 'nearestFree' | 'nearestWalk' | 'foodCount'>> = {},
  ) =>
    render(
      <QuickActions
        nearby={{
          nearestFree: null,
          nearestWalk: null,
          foodCount: null,
          ...extra,
          tickets: tickets(over),
        }}
      />,
    );

  describe('Otopark bul', () => {
    it('1. leads with the live free count of the nearest car park', async () => {
      const nearestFree = { name: 'Konak Pier', free: 12, walk: 3 } as NearbyHome['nearestFree'];
      await show({ parkWithin: 6 }, { nearestFree });
      expect(screen.getByText('12')).toBeTruthy();
      expect(screen.getByText('boş')).toBeTruthy();
      expect(screen.getByText('Konak Pier · 3 dk')).toBeTruthy();
    });

    it('2. else the number of car parks within ten minutes, with the nearest named', async () => {
      await show({ parkWithin: 6, nearestPark: { name: 'Bornova Metro', walk: 9 } });
      expect(screen.getByText('6')).toBeTruthy();
      expect(screen.getByText('otopark')).toBeTruthy();
      expect(screen.getByText('en yakını Bornova Metro · 9 dk')).toBeTruthy();
    });

    it('3. else the name and the walk of the nearest one', async () => {
      await show({ nearestPark: { name: 'Bornova Metro', walk: 9 } });
      expect(screen.getByText('Bornova Metro')).toBeTruthy();
      expect(screen.getByText('yürüyerek 9 dk')).toBeTruthy();
    });

    it('4. else the number of car parks of the city', async () => {
      await show({ cityParks: 412 });
      expect(screen.getByText('412')).toBeTruthy();
      expect(screen.getByText('otopark')).toBeTruthy();
      expect(screen.getByText('şehirde')).toBeTruthy();
    });

    it('says only what it knows when it knows nothing more', async () => {
      await show({}, { nearestWalk: 9 });
      expect(screen.getByText('en yakın 9 dk')).toBeTruthy();
      expect(screen.queryByText('0')).toBeNull();
    });

    it('is read aloud with the same fact', async () => {
      await show({ parkWithin: 6, nearestPark: { name: 'Bornova Metro', walk: 9 } });
      expect(
        screen.getByLabelText('Yakınımda otopark bul, 6 otopark, en yakını Bornova Metro · 9 dk'),
      ).toBeTruthy();
    });
  });

  describe('Yemek bul', () => {
    it('1. leads with the places open now within ten minutes', async () => {
      await show({ foodOpenNow: 34, foodWithin: 42 });
      expect(screen.getByText('34')).toBeTruthy();
      expect(screen.getByText('yer açık')).toBeTruthy();
      expect(screen.getByText('yürüme mesafesinde')).toBeTruthy();
      expect(screen.queryByText('42')).toBeNull();
    });

    it('2. else all the places within ten minutes', async () => {
      await show({ foodWithin: 42, mealNear: { cat: 'breakfast', count: 8 } });
      expect(screen.getByText('42')).toBeTruthy();
      expect(screen.getByText('restoran')).toBeTruthy();
      expect(screen.getByText('yakınında')).toBeTruthy();
    });

    it('3. else the meal of the hour with its count', async () => {
      await show({ mealNear: { cat: 'breakfast', count: 8 }, cityFood: 900 });
      expect(screen.getByText('8')).toBeTruthy();
      expect(screen.getByText('kahvaltıcı')).toBeTruthy();
      expect(screen.getByText('yakınında')).toBeTruthy();
    });

    it('3. says "over" for a big guessed count, not an exact number', async () => {
      await show({ mealNear: { cat: 'fish', count: 23 } });
      expect(screen.getByText('20+')).toBeTruthy();
      expect(screen.getByText('balıkçı')).toBeTruthy();
    });

    it('4. else the number of places of the city', async () => {
      await show({ cityFood: 900 });
      expect(screen.getByText('900')).toBeTruthy();
      expect(screen.getByText('restoran')).toBeTruthy();
      expect(screen.getByText('şehirde')).toBeTruthy();
    });

    it('with nothing known it keeps the neutral line, and never says 0', async () => {
      await show({});
      expect(screen.getByText('Yakınındaki yerler')).toBeTruthy();
      expect(screen.queryByText('0')).toBeNull();
    });

    it('never mentions parking, whichever fact leads, in either language', async () => {
      for (const lang of ['tr', 'en']) {
        await changeLanguage(lang);
        for (const over of [
          { foodOpenNow: 3 },
          { foodWithin: 3 },
          { mealNear: { cat: 'fish' as const, count: 4 } },
          { cityFood: 9 },
        ]) {
          const { unmount } = await show(over);
          const food = screen.getByLabelText(lang === 'tr' ? /yemek bul/i : /food/i);
          expect(food.props.accessibilityLabel).not.toMatch(/park/i);
          await unmount();
        }
      }
    });
  });
});
