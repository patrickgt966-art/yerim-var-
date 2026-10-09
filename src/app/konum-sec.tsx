import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Txt } from '@/components/Txt';
import type { LatLng } from '@/data/geo';
import { isInIzmirArea, IZMIR_CENTER } from '@/data/places';
import { useAnnounce, useScreenReader } from '@/lib/a11y';
import { currentLocation, reverseStreet } from '@/lib/location';
import { firstParam, parseLatLng } from '@/lib/params';
import { parsePurpose, pickedLabel } from '@/lib/pickPlace';
import { useApp } from '@/store/app';
import { asym, brand, HIT, useColors } from '@/theme';

const REVERSE_DEBOUNCE_MS = 500;
const DELTA = 0.008;

/** Full-screen map with a fixed centre pin: the map moves under it. */
export default function PickLocationScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const purpose = parsePurpose(firstParam(params.purpose));
  const q = firstParam(params.q)?.trim() || undefined;
  const food = firstParam(params.mode) === 'food';
  const cat = firstParam(params.cat);
  const screenReader = useScreenReader();
  const confirmed = useRef(false);
  const setHome = useApp((s) => s.setHome);
  const setWork = useApp((s) => s.setWork);

  const given = parseLatLng(params.lat, params.lng);
  const [start] = useState<LatLng>(given ?? IZMIR_CENTER);
  const [center, setCenter] = useState<LatLng>(start);
  const [street, setStreet] = useState<string | null>(null);
  const mapRef = useRef<MapView>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Ignore a reverse lookup that finished after the pin moved again.
  const lookupId = useRef(0);

  const cancelLookups = () => {
    lookupId.current += 1;
  };

  const lookup = (p: LatLng) => {
    clearTimeout(timer.current);
    const id = ++lookupId.current;
    timer.current = setTimeout(() => {
      void reverseStreet(p).then((a) => {
        if (id === lookupId.current) setStreet(a?.street ?? null);
      });
    }, REVERSE_DEBOUNCE_MS);
  };

  useEffect(() => {
    let alive = true;
    // Without a given point, start at the user if permission is already granted.
    if (!given) {
      void currentLocation(false, 3000).then((loc) => {
        if (!alive || !loc || !isInIzmirArea(loc)) return;
        mapRef.current?.animateToRegion(
          { latitude: loc.lat, longitude: loc.lng, latitudeDelta: DELTA, longitudeDelta: DELTA },
          0,
        );
        setCenter(loc);
        lookup(loc);
      });
    } else {
      lookup(start);
    }
    return () => {
      alive = false;
      cancelLookups();
      clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRegionChangeComplete = (r: Region) => {
    const p = { lat: r.latitude, lng: r.longitude };
    setCenter(p);
    setStreet(null);
    lookup(p);
  };

  const outside = !isInIzmirArea(center);
  const title =
    firstParam(params.title) ??
    t(
      purpose === 'home'
        ? 'picker.titleHome'
        : purpose === 'work'
          ? 'picker.titleWork'
          : 'picker.titleSearch',
    );

  useAnnounce(street ? t('picker.a11yStreet', { street }) : null, 300);

  const confirm = () => {
    if (confirmed.current) return;
    confirmed.current = true;
    if (purpose === 'search') {
      const label = pickedLabel(street, q, t('picker.fallback'));
      router.replace({
        pathname: food ? '/restoranlar' : '/sonuc',
        params: {
          lat: String(center.lat),
          lng: String(center.lng),
          label,
          ...(food && cat ? { cat } : {}),
        },
      });
      return;
    }
    const saved = { label: pickedLabel(street, undefined, t('picker.fallbackSaved')), ...center };
    (purpose === 'home' ? setHome : setWork)(saved);
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View
        style={{ flex: 1 }}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <MapView
          ref={mapRef}
          style={{ flex: 1 }}
          initialRegion={{
            latitude: start.lat,
            longitude: start.lng,
            latitudeDelta: DELTA,
            longitudeDelta: DELTA,
          }}
          showsUserLocation
          showsPointsOfInterests={false}
          onRegionChangeComplete={onRegionChangeComplete}
        />
        {/* Fixed pin: its tip sits on the map centre. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View style={{ marginBottom: 36 }}>
            <Icon name="pin" size={36} color={brand.navy} strokeWidth={2.2} />
          </View>
        </View>
      </View>

      <View
        style={[
          asym(18, 5),
          {
            position: 'absolute',
            top: insets.top + 8,
            left: 12,
            right: 12,
            minHeight: HIT,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: c.card,
            borderWidth: 1,
            borderColor: c.line,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
          style={{ width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="back" size={22} color={c.text} strokeWidth={2.2} />
        </Pressable>
        <Txt variant="bodyBold" accessibilityRole="header" numberOfLines={1} style={{ flex: 1 }}>
          {title}
        </Txt>
      </View>

      <View
        style={[
          asym(22, 6),
          {
            position: 'absolute',
            left: 12,
            right: 12,
            bottom: insets.bottom + 12,
            padding: 16,
            gap: 10,
            backgroundColor: c.card,
            borderWidth: 1,
            borderColor: c.line,
          },
        ]}
      >
        <Txt variant="caption" secondary>
          {q ? t('picker.hint', { q }) : t('picker.hintGeneric')}
        </Txt>
        <Txt variant="bodyBold" numberOfLines={2}>
          {street ?? t('picker.fallback')}
        </Txt>
        {outside && (
          <Txt variant="caption" secondary>
            {t('picker.outside')}
          </Txt>
        )}
        {screenReader && (
          <>
            <Txt variant="caption" secondary>
              {t('picker.typeHint')}
            </Txt>
            <Button
              kind="secondary"
              label={purpose === 'search' ? t('picker.backToSearch') : t('picker.typeAction')}
              onPress={() =>
                purpose === 'search'
                  ? router.back()
                  : router.replace({ pathname: '/yer-ara', params: { purpose } })
              }
            />
          </>
        )}
        <Button label={t('picker.use')} onPress={confirm} />
      </View>
    </View>
  );
}
