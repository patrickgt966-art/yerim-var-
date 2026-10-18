import '@/i18n';

import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { TypingBubble } from '../ChatBits';

// Reanimated needs the native worklets runtime; the animations are not what this test is about.
jest.mock('@/components/chat/TypingDots', () => ({ TypingDots: () => null }));
jest.mock('@/components/chat/ThinkingFx', () => ({ ThinkingBar: () => null }));
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
    expect(screen.queryByText('Mesajını okuyorum…')).toBeNull();
    expect(screen.getByLabelText('Yerim yazıyor')).toBeTruthy();
  });

  it('moves its line on as the wait grows; announced once', async () => {
    await render(<TypingBubble thinking />);
    expect(screen.getByText('Mesajını okuyorum…')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(0);
    });
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(1);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Mesajını okuyorum…');
    const steps: [number, string][] = [
      [2500, 'Sana uyan yerlere bakıyorum…'],
      [3500, 'Biraz daha düşünüyorum…'],
      [4000, 'Neredeyse hazır…'],
    ];
    for (const [ms, text] of steps) {
      await act(async () => {
        jest.advanceTimersByTime(ms);
      });
      expect(screen.getByText(text)).toBeTruthy();
      expect(screen.getByLabelText(text)).toBeTruthy();
    }
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(1);
  });
});
