import { createInstance, type TOptions } from 'i18next';
import en from './locales/en.json';
import traditional from './locales/zh-Hant.json';

export const LOCALES = ['zh-CN', 'zh-Hant', 'en'] as const;
export type Locale = typeof LOCALES[number];
export type Language = Locale | 'system';
export const LANGUAGE_LABELS = { system: '跟随系统', 'zh-CN': '简体中文', 'zh-Hant': '繁體中文', en: 'English' } as const;
export function validLanguage(value: unknown): value is Language {
  return value === 'system' || LOCALES.includes(value as Locale);
}
export function resolveLocale(language: Language, system: string): Locale {
  if (language !== 'system') return language;
  const tag = system.replaceAll('_', '-').toLowerCase();
  if (!tag.startsWith('zh')) return 'en';
  return /(?:^|-)(?:hant|tw|hk|mo)(?:-|$)/.test(tag) ? 'zh-Hant' : 'zh-CN';
}
export function createTranslator(locale: Locale) {
  const instance = createInstance();
  void instance.init({
    lng: locale, fallbackLng: 'zh-CN', supportedLngs: [...LOCALES], load: 'currentOnly',
    initAsync: false, keySeparator: false, nsSeparator: false,
    resources: { en: { translation: en }, 'zh-Hant': { translation: traditional }, 'zh-CN': { translation: {} } },
    interpolation: { escapeValue: false }, returnEmptyString: false,
  });
  return instance;
}
export const i18n = createTranslator('zh-CN');
export const t = (key: string, options?: TOptions): string => String(i18n.t(key, { defaultValue: key, ...options }));
export const currentLocale = (): Locale => i18n.language as Locale;
export function setLocale(locale: Locale) { void i18n.changeLanguage(locale); }
export const formatLocale = () => currentLocale() === 'zh-Hant' ? 'zh-TW' : currentLocale();
