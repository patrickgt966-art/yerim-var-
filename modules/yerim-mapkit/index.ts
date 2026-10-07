import { requireOptionalNativeModule } from 'expo';

export type ApplePlace = {
  name: string;
  latitude: number;
  longitude: number;
  address: string;
};

type NativeModule = {
  searchParkingAsync(latitude: number, longitude: number, radiusMeters: number): Promise<ApplePlace[]>;
};

/**
 * Null in Expo Go and on platforms without the native module; callers must
 * treat Apple Maps results as optional.
 */
export const YerimMapKit = requireOptionalNativeModule<NativeModule>('YerimMapKit');
