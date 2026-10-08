import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import tr from './tr';

export const SUPPORTED = ['tr'] as const;

const device = getLocales()[0]?.languageCode ?? 'tr';

// eslint-disable-next-line import/no-named-as-default-member
void i18n.use(initReactI18next).init({
  resources: { tr: { translation: tr } },
  lng: (SUPPORTED as readonly string[]).includes(device) ? device : 'tr',
  fallbackLng: 'tr',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
