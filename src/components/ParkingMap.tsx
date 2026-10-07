import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { visibleFree } from '@/data/freshness';
import { isStatic } from '@/lib/staticInfo';
import type { LatLng } from '@/data/geo';
import type { Parking } from '@/data/types';
import { asym, fonts } from '@/theme';

import { PPin } from './PPin';
import { Txt } from './Txt';

type Props = {
  parkings: Parking[];
  center: LatLng;
  targetLabel?: string;
  selectedId?: string | null;
  onSelect: (p: Parking) => void;
  bottomInset?: number;
  delta?: number;
};

/** Apple Maps (iOS) with parking-bay pins. No routing happens in-app. */
export const ParkingMap = forwardRef<MapView, Props>(function ParkingMap(
  { parkings, center, targetLabel, selectedId, onSelect, bottomInset = 0, delta = 0.012 },
  ref,
) {
  const { t } = useTranslation();
  return (
    <MapView
      ref={ref}
      style={{ flex: 1 }}
      initialRegion={{
        latitude: center.lat,
        longitude: center.lng,
        latitudeDelta: delta,
        longitudeDelta: delta,
      }}
      showsUserLocation
      showsPointsOfInterests={false}
      mapPadding={{ top: 0, left: 0, right: 0, bottom: bottomInset }}
    >
      {targetLabel && (
        <Marker
          coordinate={{ latitude: center.lat, longitude: center.lng }}
          tracksViewChanges={false}
          accessibilityLabel={targetLabel}
        >
          <View style={{ alignItems: 'center' }}>
            <View
              style={[
                asym(11, 3),
                { backgroundColor: '#0B3C49', paddingHorizontal: 9, paddingVertical: 3 },
              ]}
            >
              <Txt
                allowFontScaling={false}
                style={{ fontFamily: fonts.display, fontSize: 12 }}
                color="#FFFFFF"
              >
                {targetLabel}
              </Txt>
            </View>
          </View>
        </Marker>
      )}
      {parkings.map((p) => {
        const free = visibleFree(p);
        return (
          <Marker
            key={p.id}
            identifier={p.id}
            coordinate={{ latitude: p.lat, longitude: p.lng }}
            tracksViewChanges={false}
            onPress={() => onSelect(p)}
            accessibilityLabel={t('results.a11yPin', {
              name: p.name,
              free: isStatic(p)
                ? t('freshness.noData')
                : free == null
                  ? t('common.unknown')
                  : `${free} ${t('common.free')}`,
            })}
          >
            <PPin
              free={free}
              capacity={p.capacity}
              selected={p.id === selectedId}
              quiet={isStatic(p)}
            />
          </Marker>
        );
      })}
    </MapView>
  );
});
