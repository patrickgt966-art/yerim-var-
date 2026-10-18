import { Alert, Linking } from 'react-native';

import type { Parking } from '@/data/types';
import { useApp } from '@/store/app';

import { parkedHere } from '../parkHere';

const p = { id: 'ispark-1', name: 'Kadıköy Katlı', lat: 40.99, lng: 29.03 } as Parking;

beforeEach(() => {
  useApp.setState({ active: null });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});
afterEach(() => jest.restoreAllMocks());

describe('parkedHere', () => {
  it('starts the timer at once, without directions', () => {
    parkedHere(p);
    expect(useApp.getState().active?.parkingId).toBe('ispark-1');
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('asks before replacing a running park', () => {
    parkedHere({ ...p, id: 'old', name: 'Eski' });
    parkedHere(p);
    expect(useApp.getState().active?.parkingId).toBe('old');
    const buttons = jest.mocked(Alert.alert).mock.calls[0]?.[2] ?? [];
    buttons[0]?.onPress?.();
    expect(useApp.getState().active?.parkingId).toBe('ispark-1');
  });
});
