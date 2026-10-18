import * as StoreReview from 'expo-store-review';

import { useApp } from '@/store/app';

import { maybeAskForRating } from '../rating';

jest.mock('expo-store-review', () => ({
  isAvailableAsync: jest.fn(async () => true),
  requestReview: jest.fn(async () => {}),
}));

const SR = StoreReview as unknown as Record<string, jest.Mock>;
const now = new Date('2026-10-17T12:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

beforeEach(() => {
  jest.clearAllMocks();
  SR.isAvailableAsync!.mockResolvedValue(true);
  SR.requestReview!.mockResolvedValue(undefined);
  useApp.setState({ parksDone: 0, ratingAskedAt: null });
});

describe('maybeAskForRating', () => {
  it('does not ask below 3 finished parks', async () => {
    useApp.setState({ parksDone: 2 });
    await maybeAskForRating(now);
    expect(SR.requestReview).not.toHaveBeenCalled();
    expect(useApp.getState().ratingAskedAt).toBeNull();
  });

  it('asks at 3 parks when never asked, and stores the time', async () => {
    useApp.setState({ parksDone: 3 });
    await maybeAskForRating(now);
    expect(SR.requestReview).toHaveBeenCalledTimes(1);
    expect(useApp.getState().ratingAskedAt).toBe(now.toISOString());
  });

  it('does not ask again 30 days after the last ask', async () => {
    useApp.setState({ parksDone: 5, ratingAskedAt: daysAgo(30) });
    await maybeAskForRating(now);
    expect(SR.requestReview).not.toHaveBeenCalled();
    expect(useApp.getState().ratingAskedAt).toBe(daysAgo(30));
  });

  it('asks again 121 days after the last ask', async () => {
    useApp.setState({ parksDone: 5, ratingAskedAt: daysAgo(121) });
    await maybeAskForRating(now);
    expect(SR.requestReview).toHaveBeenCalledTimes(1);
    expect(useApp.getState().ratingAskedAt).toBe(now.toISOString());
  });

  it('does not ask when the store review is unavailable', async () => {
    useApp.setState({ parksDone: 5 });
    SR.isAvailableAsync!.mockResolvedValue(false);
    await maybeAskForRating(now);
    expect(SR.requestReview).not.toHaveBeenCalled();
    expect(useApp.getState().ratingAskedAt).toBeNull();
  });

  it('swallows errors', async () => {
    useApp.setState({ parksDone: 5 });
    SR.requestReview!.mockRejectedValue(new Error('boom'));
    await expect(maybeAskForRating(now)).resolves.toBeUndefined();
    expect(useApp.getState().ratingAskedAt).toBeNull();
  });
});
