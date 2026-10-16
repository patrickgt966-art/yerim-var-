import { render, screen } from '@testing-library/react-native';

import { DEFAULT_CITY } from '@/data/cities';
import { useApp } from '@/store/app';

import { HomeSkyline } from '../HomeSkyline';

describe('HomeSkyline', () => {
  // Before each test, while nothing is mounted: a store change under a mounted tree needs act().
  beforeEach(() => {
    useApp.setState({ city: DEFAULT_CITY });
  });

  it('draws İzmir by default', async () => {
    await render(<HomeSkyline />);
    expect(screen.getByTestId('skyline-izmir')).toBeTruthy();
    expect(screen.queryByTestId('skyline-istanbul')).toBeNull();
  });

  it('draws İstanbul when the selected city is İstanbul', async () => {
    useApp.getState().setCity('istanbul');
    await render(<HomeSkyline />);
    expect(screen.getByTestId('skyline-istanbul')).toBeTruthy();
    expect(screen.queryByTestId('skyline-izmir')).toBeNull();
  });

  it('draws Ankara when the selected city is Ankara', async () => {
    useApp.getState().setCity('ankara');
    await render(<HomeSkyline />);
    expect(screen.getByTestId('skyline-ankara')).toBeTruthy();
    expect(screen.queryByTestId('skyline-izmir')).toBeNull();
    expect(screen.queryByTestId('skyline-istanbul')).toBeNull();
  });

  it('draws Bursa when the selected city is Bursa', async () => {
    useApp.getState().setCity('bursa');
    await render(<HomeSkyline />);
    expect(screen.getByTestId('skyline-bursa')).toBeTruthy();
    expect(screen.queryByTestId('skyline-izmir')).toBeNull();
    expect(screen.queryByTestId('skyline-istanbul')).toBeNull();
    expect(screen.queryByTestId('skyline-ankara')).toBeNull();
  });

  it('falls back to İzmir for a city without a drawing', async () => {
    useApp.setState({ city: 'antalya' });
    await render(<HomeSkyline />);
    expect(screen.getByTestId('skyline-izmir')).toBeTruthy();
  });
});
