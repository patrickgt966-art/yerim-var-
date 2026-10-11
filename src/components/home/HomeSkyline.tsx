import Svg, { Path } from 'react-native-svg';

import { brand } from '@/theme';

/** Faint İzmir skyline along the bottom of the home hero (design B3). */
export function HomeSkyline() {
  return (
    <Svg
      width="100%"
      height={120}
      viewBox="0 0 390 120"
      preserveAspectRatio="xMidYMax slice"
      accessible={false}
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, opacity: 0.1 }}
    >
      <Path
        d="M0 120V92h22v-14h10v14h16V70h8v-8h4v8h8v50zM96 120V84h14V64h4V44h4v20h4v20h14v36zM150 120V96h30V80h20v40zM214 120V88l12-10 12 10v32zM250 120V74h6V58h3v-8h3v8h3v16h6v46zM300 120V90h40v-12h14v42zM360 120V82h30v38z"
        fill={brand.white}
      />
    </Svg>
  );
}
