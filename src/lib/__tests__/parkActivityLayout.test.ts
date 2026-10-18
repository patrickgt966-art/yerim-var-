import { createLiveActivity } from 'expo-widgets';

import { createParkActivityFactory, PARK_ACTIVITY_NAME } from '../parkActivityLayout';

jest.mock('expo-widgets', () => ({ createLiveActivity: jest.fn(() => ({})) }));

describe('the park Live Activity layout', () => {
  it('reaches expo-widgets as a self-contained source string (the "widget" directive)', () => {
    createParkActivityFactory();
    const [name, layout] = jest.mocked(createLiveActivity).mock.calls[0]!;
    expect(name).toBe(PARK_ACTIVITY_NAME);
    // babel-preset-expo stringifies the function; the widget extension evaluates it.
    expect(typeof layout).toBe('string');
    const src = layout as unknown as string;
    expect(src).toMatch(/^function\s*\(props,\s*environment\)/);
    expect(src).not.toContain("'widget'");
    // The elapsed time is a system timer, not app updates.
    expect(src).toContain('timerInterval');
    expect(src).toContain('countsDown:false');
    for (const part of ['banner', 'compactLeading', 'compactTrailing', 'minimal', 'expandedBottom'])
      expect(src).toContain(`${part}:`);
    // Nothing from this module's scope: imports would be undefined in the extension.
    expect(src).not.toMatch(/_swiftUi|_modifiers|_expoWidgets|_theme|require\(/);
  });
});
