import { useEffect } from 'react';

import { useApp } from '@/store/app';

import { cityForSharedPlace } from './shareRoute';

/**
 * A shared place that the active city does not have: switch to the city its link's `ll` lies in
 * (the same `setCity` the city picker uses). The screen reads the city, so it shows the place then.
 */
export function useSharedPlaceCity(missing: boolean, ll: string | undefined): void {
  const cityId = useApp((s) => s.city);
  const setCity = useApp((s) => s.setCity);
  const target = missing ? cityForSharedPlace(ll, cityId)?.id : undefined;
  useEffect(() => {
    if (target) setCity(target);
  }, [target, setCity]);
}
