import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { aiBaseUrl } from '@/lib/ai/client';

// JS errors go to our own worker (POST <aiUrl>/crash), no third-party SDK. The report holds the
// error message, a short stack and the app / OS version: no device id, no location, no user text.
// One report per distinct error per app session; fire and forget, and it never throws.

const MESSAGE_MAX = 300;
const STACK_LINES = 20;
const STACK_MAX = 4000;
const ROUTE_MAX = 200;
const TIMEOUT_MS = 5000;

export type CrashReport = {
  message: string;
  stack: string;
  appVersion: string;
  buildNumber: string;
  os: string;
  osVersion: string;
  route: string;
  fatal: boolean;
};

let route = '';
const sent = new Set<string>();

/** The screen the user is on (its pathname, no query), kept for the next report. */
export function setCrashRoute(pathname: string): void {
  route = pathname;
}

/** Forgets what was sent, so tests can start a new "session". */
export function resetCrashReports(): void {
  sent.clear();
  route = '';
}

function parts(error: unknown): { message: string; stack: string } {
  if (typeof error === 'object' && error !== null) {
    const e = error as { message?: unknown; stack?: unknown };
    return {
      message: typeof e.message === 'string' ? e.message : String(error),
      stack: typeof e.stack === 'string' ? e.stack : '',
    };
  }
  return { message: String(error), stack: '' };
}

/** The report for an error, with every field cut to its size cap. */
export function buildCrashReport(error: unknown, fatal: boolean): CrashReport {
  const { message, stack } = parts(error);
  const config = Constants.expoConfig;
  return {
    message: message.slice(0, MESSAGE_MAX),
    stack: stack.split('\n').slice(0, STACK_LINES).join('\n').slice(0, STACK_MAX),
    appVersion: String(config?.version ?? ''),
    buildNumber: String(config?.ios?.buildNumber ?? Constants.nativeBuildVersion ?? ''),
    os: Platform.OS,
    osVersion: String(Platform.Version),
    route: route.slice(0, ROUTE_MAX),
    fatal,
  };
}

/**
 * Sends the error once per app session (production builds only). Never throws and never waits:
 * a lost connection or a slow server (5 s) just drops the report.
 */
export function reportError(error: unknown, fatal = false): void {
  try {
    if (__DEV__) return;
    const url = aiBaseUrl();
    if (!url) return;
    const report = buildCrashReport(error, fatal);
    const key = `${report.message}\n${report.stack.split('\n')[0] ?? ''}`;
    if (sent.has(key)) return;
    sent.add(key);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    fetch(`${url}/crash`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(report),
      signal: controller.signal,
    })
      .catch(() => {})
      .finally(() => clearTimeout(timer));
  } catch {
    // Reporting must never be the next error.
  }
}

let installed = false;

/** Reports uncaught JS errors, then hands them to the handler that was set before. */
export function installErrorReporting(): void {
  if (installed || __DEV__) return;
  installed = true;
  const previous = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    reportError(error, !!isFatal);
    previous(error, isFatal);
  });
}
