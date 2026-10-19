import { aiBaseUrl } from '@/lib/ai/client';

import {
  buildCrashReport,
  installErrorReporting,
  reportError,
  resetCrashReports,
  setCrashRoute,
} from '../crashReport';

jest.mock('@/lib/ai/client', () => ({ aiBaseUrl: jest.fn(() => 'https://ai.test') }));

const g = globalThis as unknown as { __DEV__: boolean; ErrorUtils: unknown };
const fetchMock = jest.fn(async (..._args: unknown[]) => ({ ok: true }) as Response);
const realDev = g.__DEV__;

beforeEach(() => {
  g.__DEV__ = false;
  resetCrashReports();
  fetchMock.mockClear();
  fetchMock.mockImplementation(async () => ({ ok: true }) as Response);
  global.fetch = fetchMock as unknown as typeof fetch;
  (aiBaseUrl as jest.Mock).mockReturnValue('https://ai.test');
});
afterAll(() => {
  g.__DEV__ = realDev;
});

const body = (call = 0) =>
  JSON.parse((fetchMock.mock.calls[call]![1] as RequestInit).body as string);

describe('reportError', () => {
  it('posts the report to <aiUrl>/crash', () => {
    setCrashRoute('/restoran/osm-n1');
    reportError(new Error('boom'), true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://ai.test/crash');
    expect(init.method).toBe('POST');
    const sent = body();
    expect(Object.keys(sent).sort()).toEqual(
      ['appVersion', 'buildNumber', 'fatal', 'message', 'os', 'osVersion', 'route', 'stack'].sort(),
    );
    expect(sent).toMatchObject({ message: 'boom', route: '/restoran/osm-n1', fatal: true });
  });

  it('sends one report per distinct error', () => {
    const a = new Error('same');
    reportError(a);
    reportError(a);
    reportError(new Error('same'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    reportError(new Error('other'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caps the message at 300 characters and the stack at 20 lines / 4000 characters', () => {
    const err = new Error('x'.repeat(1000));
    err.stack = Array.from({ length: 50 }, (_, i) => `at fn${i}`).join('\n');
    expect(buildCrashReport(err, false).stack.split('\n')).toHaveLength(20);
    err.stack = 'y'.repeat(9000);
    const r = buildCrashReport(err, false);
    expect(r.message).toHaveLength(300);
    expect(r.stack).toHaveLength(4000);
  });

  it('copes with a thrown string or undefined', () => {
    reportError('just text');
    reportError(undefined);
    expect(body(0).message).toBe('just text');
    expect(body(1).message).toBe('undefined');
  });

  it('sends nothing in development', () => {
    g.__DEV__ = true;
    reportError(new Error('dev'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends nothing when the server address is not set', () => {
    (aiBaseUrl as jest.Mock).mockReturnValue(null);
    reportError(new Error('no url'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never throws, whether fetch throws or rejects', () => {
    fetchMock.mockImplementationOnce(() => {
      throw new Error('sync');
    });
    expect(() => reportError(new Error('a'))).not.toThrow();
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error('async')));
    expect(() => reportError(new Error('b'))).not.toThrow();
  });

  it('gives up after 5 seconds', () => {
    jest.useFakeTimers();
    try {
      reportError(new Error('slow'));
      const signal = (fetchMock.mock.calls[0]![1] as RequestInit).signal as AbortSignal;
      expect(signal.aborted).toBe(false);
      jest.advanceTimersByTime(5000);
      expect(signal.aborted).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('installErrorReporting', () => {
  it('reports an uncaught error, then calls the handler that was set before', () => {
    const previous = jest.fn();
    let handler: (e: unknown, fatal?: boolean) => void = () => {};
    g.ErrorUtils = {
      getGlobalHandler: () => previous,
      setGlobalHandler: (h: typeof handler) => {
        handler = h;
      },
    };
    installErrorReporting();
    const err = new Error('uncaught');
    handler(err, true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(body()).toMatchObject({ message: 'uncaught', fatal: true });
    expect(previous).toHaveBeenCalledWith(err, true);
  });
});
