import { requireOptionalNativeModule } from 'expo';

export type ApplePlace = {
  name: string;
  latitude: number;
  longitude: number;
  address: string;
};

export type ApplePlaceResult = ApplePlace & {
  phone: string;
  url: string;
  /** MKPointOfInterestCategory raw value, e.g. "MKPOICategoryRestaurant"; "" for addresses. */
  category: string;
};

type NativeModule = {
  searchPlacesAsync(
    query: string,
    latitude: number,
    longitude: number,
    radiusMeters: number,
  ): Promise<ApplePlaceResult[]>;
  searchParkingAsync(
    latitude: number,
    longitude: number,
    radiusMeters: number,
  ): Promise<ApplePlace[]>;
};

/**
 * Null in Expo Go and on platforms without the native module; callers must
 * treat Apple Maps results as optional.
 */
export const YerimMapKit = requireOptionalNativeModule<NativeModule>('YerimMapKit');
