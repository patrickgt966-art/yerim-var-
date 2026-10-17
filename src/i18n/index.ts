import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en';
import tr from './tr';

export const SUPPORTED = ['tr', 'en'] as const;
export type Lang = (typeof SUPPORTED)[number];
/** The user's choice: a language, or 'auto' to follow the phone. */
export type LangPref = Lang | 'auto';

/** The phone's language: Turkish phones get Turkish, every other phone English. */
export function deviceLang(): Lang {
  return getLocales()[0]?.languageCode === 'tr' ? 'tr' : 'en';
}

export const resolveLang = (pref: LangPref): Lang => (pref === 'auto' ? deviceLang() : pref);

// eslint-disable-next-line import/no-named-as-default-member
void i18n.use(initReactI18next).init({
  resources: { tr: { translation: tr }, en: { translation: en } },
  lng: deviceLang(),
  fallbackLng: 'tr',
  interpolation: { escapeValue: false },
  returnNull: false,
});

/** Switches the whole app (and the AI's free text) to the chosen language. */
export function applyLanguage(pref: LangPref): void {
  const lang = resolveLang(pref);
  // eslint-disable-next-line import/no-named-as-default-member
  if (i18n.language !== lang) void i18n.changeLanguage(lang);
}

export default i18n;
