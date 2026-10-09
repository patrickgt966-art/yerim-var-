import Svg, { Circle, Path, Rect } from 'react-native-svg';

/** Stroke icons transcribed from design/*.html. */
export type IconName =
  | 'search'
  | 'map'
  | 'star'
  | 'starFilled'
  | 'user'
  | 'back'
  | 'filter'
  | 'locate'
  | 'clock'
  | 'hourglass'
  | 'home'
  | 'briefcase'
  | 'tower'
  | 'waves'
  | 'arch'
  | 'ferry'
  | 'arrow'
  | 'external'
  | 'cup'
  | 'fish'
  | 'flame'
  | 'egg'
  | 'glass'
  | 'burger'
  | 'icecream'
  | 'bowl'
  | 'cutlery'
  | 'edit'
  | 'pin';

type Props = { name: IconName; size?: number; color: string; strokeWidth?: number };

export function Icon({ name, size = 24, color, strokeWidth = 2 }: Props) {
  const common = {
    fill: 'none',
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  const big = name === 'tower' || name === 'waves' || name === 'arch' || name === 'ferry';
  return (
    <Svg width={size} height={size} viewBox={big ? '0 0 32 32' : '0 0 24 24'} accessible={false}>
      {name === 'search' && (
        <>
          <Circle cx={11} cy={11} r={7} {...common} />
          <Path d="M20 20l-4-4" {...common} />
        </>
      )}
      {name === 'map' && (
        <Path d="M9 4L3.5 6.5v13L9 17l6 2.5 5.5-2.5v-13L15 6.5 9 4zM9 4v13M15 6.5v13" {...common} />
      )}
      {(name === 'star' || name === 'starFilled') && (
        <Path
          d="M12 4l2.4 5 5.4.7-4 3.8 1 5.4-4.8-2.6-4.8 2.6 1-5.4-4-3.8 5.4-.7z"
          {...common}
          fill={name === 'starFilled' ? color : 'none'}
        />
      )}
      {name === 'user' && (
        <>
          <Circle cx={12} cy={8.5} r={3.5} {...common} />
          <Path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" {...common} />
        </>
      )}
      {name === 'back' && <Path d="M15 5l-7 7 7 7" {...common} />}
      {name === 'edit' && (
        <Path d="M4 20l1-4L16.5 4.5a2 2 0 013 3L8 19l-4 1zM14.5 6.5l3 3" {...common} />
      )}
      {name === 'pin' && (
        <>
          <Path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11z" {...common} />
          <Circle cx={12} cy={10} r={2.3} {...common} />
        </>
      )}
      {name === 'filter' && <Path d="M4 7h16M7 12h10M10 17h4" {...common} />}
      {name === 'locate' && (
        <>
          <Circle cx={12} cy={12} r={3} {...common} />
          <Circle cx={12} cy={12} r={8} {...common} />
          <Path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" {...common} />
        </>
      )}
      {name === 'clock' && (
        <>
          <Circle cx={12} cy={12} r={8.5} {...common} />
          <Path d="M12 7.5V12l3 2" {...common} />
        </>
      )}
      {name === 'hourglass' && (
        <Path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9" {...common} />
      )}
      {name === 'home' && <Path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" {...common} />}
      {name === 'briefcase' && (
        <>
          <Rect x={3.5} y={7.5} width={17} height={12} rx={2} {...common} />
          <Path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3.5 13h17" {...common} />
        </>
      )}
      {name === 'tower' && (
        <>
          <Path d="M11 29V14h10v15M9 29h14M12 14l4-8 4 8M16 2v4" {...common} />
          <Circle cx={16} cy={19} r={2.5} {...common} />
        </>
      )}
      {name === 'waves' && (
        <Path d="M3 20c3-4 5 4 8 0s5 4 8 0 5 4 8 0M3 12c3-4 5 4 8 0s5 4 8 0 5 4 8 0" {...common} />
      )}
      {name === 'arch' && (
        <Path d="M4 28V14a12 12 0 0 1 24 0v14M10 28V16a6 6 0 0 1 12 0v12" {...common} />
      )}
      {name === 'ferry' && (
        <Path d="M3 20h26l-4 7H7zM8 20v-6h16v6M13 14V9h6v5M15 9V5h2v4" {...common} />
      )}
      {name === 'arrow' && <Path d="M5 12h14M13 6l6 6-6 6" {...common} />}
      {name === 'external' && <Path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5" {...common} />}
      {name === 'cup' && (
        <>
          <Path
            d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h1.5a2.5 2.5 0 0 1 0 5H16"
            {...common}
          />
          <Path d="M8 3v2M12 3v2" {...common} />
        </>
      )}
      {name === 'fish' && (
        <>
          <Path d="M3 12c3-5 9-6 13-3l5-3v12l-5-3c-4 3-10 2-13-3z" {...common} />
          <Circle cx={8} cy={11} r={0.6} {...common} />
        </>
      )}
      {name === 'flame' && (
        <Path
          d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z"
          {...common}
        />
      )}
      {name === 'egg' && (
        <Path d="M12 3c-3.5 0-6.5 6-6.5 10.5a6.5 6.5 0 0 0 13 0C18.5 9 15.5 3 12 3z" {...common} />
      )}
      {name === 'glass' && <Path d="M5 4h14l-7 8zM12 12v8M8 20h8" {...common} />}
      {name === 'burger' && (
        <Path
          d="M4 11a8 6 0 0 1 16 0zM3 15h18M4 15.5h16v1a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z"
          {...common}
        />
      )}
      {name === 'bowl' && (
        <Path d="M4 11h16a8 8 0 0 1-16 0zM9 4c0 2 2 2 2 4M14 4c0 2 2 2 2 4" {...common} />
      )}
      {name === 'icecream' && <Path d="M7.5 12a4.5 4.5 0 1 1 9 0zM8 12l4 9 4-9" {...common} />}
      {name === 'cutlery' && (
        <Path
          d="M7 3v7M4.5 3v5a2.5 2.5 0 0 0 5 0V3M7 11v10M17 21V3c-2.5 1.5-3 5-3 8h3"
          {...common}
        />
      )}
    </Svg>
  );
}
