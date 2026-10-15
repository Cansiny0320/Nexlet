import { createInstance } from 'i18next';
import en from './locales/en.json';
import traditional from './locales/zh-Hant.json';
export const locales = ['zh-CN', 'zh-Hant', 'en'] as const;
export type Locale = (typeof locales)[number];
export type PagePath = '/' | '/download/' | '/plugins/';
export const languageNames: Record<Locale, string> = {
  'zh-CN': '简体中文',
  'zh-Hant': '繁體中文',
  en: 'English',
};
export function localeFromPath(path: string): Locale {
  return path === '/en' || path.startsWith('/en/')
    ? 'en'
    : path === '/zh-Hant' || path.startsWith('/zh-Hant/')
      ? 'zh-Hant'
      : 'zh-CN';
}
export function basePath(path: string): string {
  return path.replace(/^\/(?:en|zh-Hant)(?=\/|$)/, '') || '/';
}
export function localizedPath(path: string, locale: Locale): string {
  return (locale === 'zh-CN' ? '' : '/' + locale) + basePath(path);
}
export function createTranslator(locale: Locale) {
  const instance = createInstance();
  void instance.init({
    lng: locale,
    fallbackLng: 'zh-CN',
    supportedLngs: [...locales],
    load: 'currentOnly',
    initAsync: false,
    keySeparator: false,
    nsSeparator: false,
    interpolation: { escapeValue: false },
    resources: {
      en: { translation: en },
      'zh-Hant': { translation: traditional },
      'zh-CN': { translation: {} },
    },
  });
  return instance;
}
export function documentLink(path: string, locale: Locale) {
  return path.replace(/\.md(?=#|$)/, locale === 'zh-CN' ? '.md' : `.${locale}.md`);
}
