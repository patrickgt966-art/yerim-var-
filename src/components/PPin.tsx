import { View } from 'react-native';

import { occupancyLevel } from '@/data/freshness';
import { brand, fonts, useColors } from '@/theme';

import { Txt } from './Txt';

/**
 * Map pin shaped like a parking bay: P badge over the free count.
 * `quiet`: a car park without a live count; a smaller brand-navy bay with
 * just the P, so live pins stand out and no "?" suggests an error.
 */
export function PPin({
  free,
  capacity,
  selected,
  quiet,
}: {
  free: number | null;
  capacity: number | null;
  selected?: boolean;
  quiet?: boolean;
}) {
  const c = useColors();
  if (quiet) {
    const s = selected ? 1.15 : 1;
    return (
      <View
        style={{
          width: 26 * s,
          height: 34 * s,
          borderRadius: 8,
          backgroundColor: brand.navy,
          borderWidth: 2,
          borderColor: brand.white,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: brand.navy,
          shadowOpacity: 0.22,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 3 },
        }}
      >
        <Txt
          allowFontScaling={false}
          style={{ fontFamily: fonts.display, fontSize: 14, lineHeight: 17 }}
          color={brand.white}
        >
          P
        </Txt>
      </View>
    );
  }
  const level = occupancyLevel(free, capacity);
  const bg =
    level === 'plenty' ? c.plenty : level === 'few' ? c.few : level === 'full' ? c.full : '#5C7580';
  const scale = selected ? 1.15 : 1;
  return (
    <View
      style={{
        width: 34 * scale,
        height: 48 * scale,
        borderRadius: 10,
        backgroundColor: bg,
        borderWidth: 2,
        borderColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#0B3C49',
        shadowOpacity: 0.28,
        shadowRadius: 5,
        shadowOffset: { width: 0, height: 4 },
      }}
    >
      <View
        style={{
          position: 'absolute',
          top: 3,
          left: 3,
          right: 3,
          bottom: 3,
          borderRadius: 6,
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: 'rgba(255,255,255,0.75)',
        }}
      />
      <View
        style={{
          width: 16,
          height: 16,
          borderTopLeftRadius: 5,
          borderTopRightRadius: 5,
          borderBottomRightRadius: 5,
          borderBottomLeftRadius: 2,
          backgroundColor: '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 1,
        }}
      >
        <Txt
          allowFontScaling={false}
          style={{ fontFamily: fonts.display, fontSize: 12, lineHeight: 15 }}
          color="#0B3C49"
        >
          P
        </Txt>
      </View>
      <Txt
        allowFontScaling={false}
        style={{ fontFamily: fonts.display, fontSize: 16, lineHeight: 19 }}
        color="#FFFFFF"
      >
        {free == null ? '?' : String(free)}
      </Txt>
    </View>
  );
}
