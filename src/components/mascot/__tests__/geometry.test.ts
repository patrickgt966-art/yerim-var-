import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { designMascotJs } from '../designJs';
import { defaultArm, mascotShapes, toSvgString } from '../geometry';

describe("Yerim's drawing has one source", () => {
  it('design/maskot.js is generated from geometry.ts and up to date (run npm run build-mascot)', () => {
    const onDisk = readFileSync(join(__dirname, '../../../../design/maskot.js'), 'utf8');
    expect(onDisk).toBe(designMascotJs());
  });

  it('holds a fork, a P sign or a star in the hand; the question floats', () => {
    expect(defaultArm('fork')).toBe('hold');
    expect(defaultArm('park')).toBe('hold');
    expect(defaultArm('star')).toBe('hold');
    expect(defaultArm('ask')).toBe('rest');
    expect(defaultArm('none')).toBe('rest');
  });

  it('draws in order: ground, arms, body, eyes, mouth, prop, leaning by default', () => {
    const svg = toSvgString([mascotShapes({ prop: 'park' })], () => 'F');
    expect(svg.startsWith('<g transform="rotate(-4 62 100)"><ellipse cx="62" cy="116"')).toBe(true);
    const body = svg.indexOf('M50 12H78');
    expect(svg.indexOf('M108 70Q')).toBeLessThan(body);
    expect(svg.lastIndexOf('font-family="F"')).toBeGreaterThan(body);
    expect(svg).toContain('>P</text>');
  });
});
