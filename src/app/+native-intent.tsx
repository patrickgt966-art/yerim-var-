import { shareRoute } from '@/lib/shareRoute';
import { didHydrationFail, onHydrationFail, useApp } from '@/store/app';

// The saved "onboarded" flag is read from storage: wait for it, or a first-run check would be wrong.
const hydrated = () =>
  new Promise<void>((resolve) => {
    if (useApp.persist.hasHydrated() || didHydrationFail()) return resolve();
    const done = () => {
      offDone();
      offFail();
      resolve();
    };
    const offDone = useApp.persist.onFinishHydration(done);
    const offFail = onHydrationFail(done);
  });

/**
 * https://yerimvar.app/r/<id> opens the restaurant and /p/<id> the car park (Universal Links);
 * other yerimvar.app links open the home screen. Before onboarding is done every such link lands
 * on onboarding. Links that are not ours pass through unchanged.
 */
export async function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    const route = shareRoute(path);
    if (route == null) return path;
    await hydrated();
    return useApp.getState().onboarded ? route : '/onboarding';
  } catch {
    return '/';
  }
}
