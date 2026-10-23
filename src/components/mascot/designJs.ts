/**
 * Builds `design/maskot.js` (the design drafts' copy of Yerim) from `geometry.ts`, so the drafts
 * and the app always draw the same mascot. `npm run build-mascot` writes it; a test fails when the
 * file on disk is out of date.
 */
import {
  ARMS,
  EYES,
  faceShapes,
  GROUND,
  MASCOT_VIEWBOX,
  MOUTHS,
  PROPS,
  SHELL,
  toSvgString,
  type FaceEyes,
  type Shape,
} from './geometry';

const FONT = () => 'Bricolage Grotesque,Plus Jakarta Sans,sans-serif';
const svg = (shapes: Shape[]) => toSvgString(shapes, FONT);
const table = <K extends string>(t: Record<K, Shape[]>) =>
  Object.fromEntries(Object.entries<Shape[]>(t).map(([k, v]) => [k, svg(v)]));

export function designMascotJs(): string {
  const faces = Object.fromEntries(
    (['open', 'happy', 'blink', 'up', 'sad'] as FaceEyes[]).map((e) => [e, svg(faceShapes(e))]),
  );
  const data = {
    vb: [MASCOT_VIEWBOX.x, MASCOT_VIEWBOX.y, MASCOT_VIEWBOX.w, MASCOT_VIEWBOX.h],
    ground: svg(GROUND),
    shell: svg(SHELL),
    eyes: table(EYES),
    mouth: table(MOUTHS),
    arm: table(ARMS),
    prop: table(PROPS),
    face: faces,
  };
  return `// GENERATED from src/components/mascot/geometry.ts by \`npm run build-mascot\`. Do not edit by hand.
/*
  Yerim, the Yerim button come alive, for the design drafts. Same drawing as the app's Mascot.
  yerimMascot({ size, eyes, mouth, arm, prop, tilt, extra })
    eyes:  ${Object.keys(EYES).join(' | ')}
    mouth: ${Object.keys(MOUTHS).join(' | ')}
    arm:   ${Object.keys(ARMS).join(' | ')}   (with a fork, P sign or star and no arm: hold)
    prop:  ${Object.keys(PROPS).join(' | ')}
  yerimMascotLayers(size, { eyes:[...], mouth:[...], arm:[...], prop:[...] }): every variant in its own
    <g id="eyes-open" opacity="0">, for scenes that switch them frame by frame.
  yerimFace(size, eyes): the small face (Yerim button, avatars).
*/
(function () {
  const D = ${JSON.stringify(data)};
  const open = (size) => {
    const h = (size * D.vb[3]) / D.vb[2];
    return '<svg width="' + size + '" height="' + h + '" viewBox="' + D.vb.join(' ') + '" style="overflow:visible;display:block" aria-hidden="true">';
  };
  window.yerimMascot = function ({ size = 120, eyes = 'open', mouth = 'smile', arm, prop = 'none', tilt = -4, extra = '' } = {}) {
    const a = arm || (prop !== 'none' && prop !== 'ask' ? 'hold' : 'rest');
    return open(size) + '<g transform="rotate(' + tilt + ' 62 100)">' + D.ground + D.arm[a] + D.shell + D.eyes[eyes] + D.mouth[mouth] + D.prop[prop] + extra + '</g></svg>';
  };
  window.yerimMascotLayers = function (size, ids) {
    const g = (k, v) => '<g id="' + k + '-' + v + '" opacity="0">' + D[k][v] + '</g>';
    let s = open(size) + '<g transform="rotate(-4 62 100)">' + D.ground;
    for (const v of ids.arm || []) s += g('arm', v);
    s += D.shell;
    for (const k of ['eyes', 'mouth', 'prop']) for (const v of ids[k] || []) s += g(k, v);
    return s + '</g></svg>';
  };
  window.yerimFace = function (size = 34, eyes = 'open') {
    return '<svg width="' + size + '" height="' + (size * 28) / 34 + '" viewBox="0 0 34 28" aria-hidden="true">' + D.face[eyes] + '</svg>';
  };
  window.yerimMascotViewBox = D.vb;
})();
`;
}
