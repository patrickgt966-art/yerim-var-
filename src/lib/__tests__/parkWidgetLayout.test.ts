import { createWidget } from 'expo-widgets';

import { createParkWidget, PARK_WIDGET_NAME } from '../parkWidgetLayout';
import type { ParkWidgetProps } from '../parkWidget';

jest.mock('expo-widgets', () => ({ createWidget: jest.fn(() => ({})) }));

type Node = { type: unknown; props: { children?: unknown; [k: string]: unknown } };

// The layout reaches expo-widgets as a source string; the widget extension runs it with the
// @expo/ui components and modifiers as globals. Run it here the same way, with stubs that record
// the tree.
function layoutFn(): (props: ParkWidgetProps, env: Record<string, unknown>) => Node {
  createParkWidget();
  const call = jest.mocked(createWidget).mock.calls[0]!;
  expect(call[0]).toBe(PARK_WIDGET_NAME);
  const src = call[1] as unknown as string;
  expect(typeof src).toBe('string');
  expect(src).toMatch(/^function\s*\(props,\s*environment\)/);
  expect(src).not.toMatch(/_swiftUi|_modifiers|_expoWidgets|_theme|require\(/);
  const comp = (name: string) => name;
  const mod =
    (name: string) =>
    (...args: unknown[]) => ({ modifier: name, args });
  const scope: Record<string, unknown> = {
    _jsx: (type: unknown, props: Node['props']) => ({ type, props }),
    _jsxs: (type: unknown, props: Node['props']) => ({ type, props }),
    _Fragment: 'fragment',
    ...Object.fromEntries(
      ['HStack', 'Image', 'Link', 'Spacer', 'Text', 'VStack'].map((n) => [n, comp(n)]),
    ),
    ...Object.fromEntries(
      [
        'containerBackground',
        'font',
        'foregroundStyle',
        'frame',
        'lineLimit',
        'monospacedDigit',
        'widgetURL',
      ].map((n) => [n, mod(n)]),
    ),
  };
  return new Function('scope', `with (scope) { return (${src}); }`)(scope);
}

const walk = (n: unknown, visit: (n: Node) => void) => {
  if (Array.isArray(n)) return n.forEach((c) => walk(c, visit));
  if (n && typeof n === 'object' && 'type' in n) {
    visit(n as Node);
    walk((n as Node).props.children, visit);
  }
};
const texts = (tree: Node) => {
  const out: string[] = [];
  walk(tree, (n) => {
    const c = n.props.children;
    for (const x of Array.isArray(c) ? c.flat(Infinity) : [c])
      if (typeof x === 'string') out.push(x);
    if (typeof n.props.label === 'string') out.push(n.props.label);
  });
  return out.join(' | ');
};
const count = (tree: Node, pred: (n: Node) => boolean) => {
  let k = 0;
  walk(tree, (n) => void (pred(n) && k++));
  return k;
};

const T0 = Date.UTC(2026, 9, 17, 10);
const base: ParkWidgetProps = {
  labels: {
    app: 'Yerim Var',
    parked: 'Park edildi',
    parkedShort: 'Park',
    nearest: 'En yakın otopark',
    walkShort: '~4 dk',
    findPark: 'Otopark bul',
    findFood: 'Yemek bul',
    min: 'dk',
  },
  colors: { bg: '#0B3C49', text: '#FFFFFF', muted: '#9FE3D2', accent: '#FF8A1F' },
};
const states: Record<string, ParkWidgetProps> = {
  parked: { ...base, parked: { name: 'Konak Otoparkı', startedAt: T0 } },
  nearest: {
    ...base,
    nearest: {
      name: 'Alsancak Katlı',
      walkMin: 4,
      free: 12,
      at: T0,
      walkText: '~4 dk yürüme',
      freeText: '12 boş yer',
      asOfText: '13:00 itibarıyla',
    },
  },
  nearestNoCount: {
    ...base,
    nearest: {
      name: 'Alsancak Katlı',
      walkMin: 4,
      free: null,
      at: T0,
      walkText: '~4 dk yürüme',
      freeText: null,
      asOfText: '13:00 itibarıyla',
    },
  },
  empty: base,
};
const families = [
  'systemSmall',
  'systemMedium',
  'systemLarge',
  'accessoryCircular',
  'accessoryRectangular',
  'accessoryInline',
];
const modes = [undefined, 'fullColor', 'accented', 'vibrant'];

describe('the Yerim Var widget layout', () => {
  it('renders every family and rendering mode for parked / nearest / empty without throwing', () => {
    const layout = layoutFn();
    for (const [state, props] of Object.entries(states))
      for (const widgetFamily of families)
        for (const widgetRenderingMode of modes) {
          const tree = layout(props, { widgetFamily, widgetRenderingMode, date: new Date(T0) });
          expect([state, widgetFamily, tree && typeof tree]).toEqual([
            state,
            widgetFamily,
            'object',
          ]);
          // Every family opens the app on tap.
          expect(count(tree, () => true)).toBeGreaterThan(0);
          expect(JSON.stringify(tree)).toContain('widgetURL');
        }
  });

  it('parked: the label, the car park and a live timer from startedAt', () => {
    const layout = layoutFn();
    for (const widgetFamily of ['systemSmall', 'systemMedium', 'accessoryRectangular']) {
      const tree = layout(states.parked!, { widgetFamily });
      const t = texts(tree);
      expect(t).toContain('Park edildi');
      expect(t).toContain('Konak Otoparkı');
      const timers = count(tree, (n) => n.type === 'Text' && 'timerInterval' in n.props);
      expect(timers).toBeGreaterThan(0);
      walk(tree, (n) => {
        const ti = n.props.timerInterval as { lower: Date } | undefined;
        if (ti) expect(ti.lower.getTime()).toBe(T0);
      });
    }
    const inline = layout(states.parked!, { widgetFamily: 'accessoryInline' });
    expect(texts(inline)).toContain('Park');
    expect(count(inline, (n) => 'timerInterval' in n.props)).toBe(1);
  });

  it('nearest: name, walk, free count only when known, and the data time', () => {
    const layout = layoutFn();
    for (const widgetFamily of ['systemSmall', 'systemMedium']) {
      const t = texts(layout(states.nearest!, { widgetFamily }));
      for (const s of [
        'En yakın otopark',
        'Alsancak Katlı',
        '~4 dk yürüme',
        '12 boş yer',
        '13:00 itibarıyla',
      ])
        expect(t).toContain(s);
      const none = texts(layout(states.nearestNoCount!, { widgetFamily }));
      expect(none).toContain('13:00 itibarıyla');
      expect(none).not.toContain('boş yer');
    }
    expect(texts(layout(states.nearest!, { widgetFamily: 'accessoryInline' }))).toBe(
      'En yakın otopark ~4 dk',
    );
    expect(texts(layout(states.nearest!, { widgetFamily: 'accessoryCircular' }))).toContain('4');
  });

  it('empty: the app name and the two actions, as links on the medium size', () => {
    const layout = layoutFn();
    const small = texts(layout(states.empty!, { widgetFamily: 'systemSmall' }));
    expect(small).toContain('Otopark bul');
    expect(small).toContain('Yemek bul');
    const medium = layout(states.empty!, { widgetFamily: 'systemMedium' });
    expect(texts(medium)).toContain('Yerim Var');
    const links: string[] = [];
    walk(medium, (n) => void (n.type === 'Link' && links.push(String(n.props.destination))));
    expect(links).toEqual(['yerimvar://sonuc?near=1', 'yerimvar://']);
  });

  it('uses no custom colours in tinted and lock screen modes', () => {
    const layout = layoutFn();
    for (const [, props] of Object.entries(states))
      for (const [widgetFamily, widgetRenderingMode] of [
        ['systemSmall', 'accented'],
        ['systemMedium', 'accented'],
        ['accessoryRectangular', 'vibrant'],
        ['accessoryCircular', 'vibrant'],
        ['accessoryInline', 'vibrant'],
        ['accessoryRectangular', 'fullColor'],
      ]) {
        const json = JSON.stringify(layout(props, { widgetFamily, widgetRenderingMode }));
        for (const colour of Object.values(props.colors)) expect(json).not.toContain(colour);
      }
    // The full colour home screen widget does use them.
    expect(JSON.stringify(layout(states.parked!, { widgetFamily: 'systemSmall' }))).toContain(
      '#0B3C49',
    );
  });
});
