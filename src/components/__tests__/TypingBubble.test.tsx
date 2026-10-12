import '@/i18n';

import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { TypingBubble } from '../ChatBits';

// Reanimated needs the native worklets runtime; the dots are not what this test is about.
jest.mock('@/components/chat/TypingDots', () => ({ TypingDots: () => null }));
jest.mock('@/components/chat/YAvatar', () => ({ YAvatar: () => null }));
jest.mock('@/components/chat/ResultCard', () => ({ ResultCard: () => null }));
jest.mock('@/components/chat/PlanCard', () => ({ PlanCard: () => null }));

describe('TypingBubble', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('shows only the dots while the rules answer', async () => {
    await render(<TypingBubble />);
    expect(screen.queryByText('Yerim düşünüyor…')).toBeNull();
    expect(screen.getByLabelText('Yerim yazıyor')).toBeTruthy();
  });

  it('says "Yerim düşünüyor…", then "Biraz daha düşünüyorum…" after 2.5 s; announced once', async () => {
    await render(<TypingBubble thinking />);
    expect(screen.getByText('Yerim düşünüyor…')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(0);
    });
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(1);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Yerim düşünüyor…');
    await act(async () => {
      jest.advanceTimersByTime(2400);
    });
    expect(screen.getByText('Yerim düşünüyor…')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    expect(screen.getByText('Biraz daha düşünüyorum…')).toBeTruthy();
    expect(screen.getByLabelText('Biraz daha düşünüyorum…')).toBeTruthy();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(1);
  });
});
