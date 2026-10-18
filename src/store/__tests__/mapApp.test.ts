import { persistedData } from '../migrate';
import { useApp } from '../app';

describe('mapApp', () => {
  it('defaults to asking every time and is set through the store', () => {
    expect(useApp.getState().mapApp).toBeNull();
    useApp.getState().setMapApp('waze');
    expect(useApp.getState().mapApp).toBe('waze');
    useApp.getState().setMapApp(null);
    expect(useApp.getState().mapApp).toBeNull();
  });

  it('keeps a known app from persisted data and turns anything else into null', () => {
    expect(persistedData({ mapApp: 'google' }).mapApp).toBe('google');
    expect(persistedData({ mapApp: 'bing' }).mapApp).toBeNull();
    expect(persistedData({ mapApp: 7 }).mapApp).toBeNull();
    expect(persistedData({})).not.toHaveProperty('mapApp');
  });
});
