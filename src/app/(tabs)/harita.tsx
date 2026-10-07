import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { ParkingMap } from '@/components/ParkingMap';
import { SampleBanner } from '@/components/SampleBanner';
import type { LatLng } from '@/data/geo';
import { IZMIR_CENTER } from '@/data/places';
import { rankByDistance, useParkings } from '@/data/useParkings';
import { currentLocation } from '@/lib/location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function MapTab() {
  const insets = useSafeAreaInsets();
  const { data } = useParkings();
  const [center, setCenter] = useState<LatLng | null>(null);

  useEffect(() => {
    // Do not prompt here; onboarding asks once.
    void currentLocation(false).then((loc) => setCenter(loc ?? IZMIR_CENTER));
  }, []);

  // ~1,600 car parks in the province: draw only those around the centre.
  const nearby = useMemo(
    () => (data && center ? rankByDistance(data.parkings, center, 4000) : []),
    [data, center],
  );

  if (!center) return <View style={{ flex: 1 }} />;
  return (
    <View style={{ flex: 1 }}>
      <ParkingMap
        parkings={nearby}
        center={center}
        delta={0.06}
        onSelect={(p) => router.push({ pathname: '/otopark/[id]', params: { id: p.id } })}
      />
      {(data?.source === 'mock' || data?.offline) && (
        <View style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16 }}>
          <SampleBanner result={data} />
        </View>
      )}
    </View>
  );
}
