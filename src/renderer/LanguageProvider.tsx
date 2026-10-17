import { useEffect, useState, type ReactNode } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { i18n, setLocale, type Locale } from '../shared/i18n';

declare global {
  interface Window {
    appLanguage: {
      get(): Promise<Locale>;
      onChange(callback: (locale: Locale) => void): () => void;
    };
  }
}
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true,
      changed = false;
    const apply = (locale: Locale) => {
      if (!alive) return;
      setLocale(locale);
      document.documentElement.lang = locale;
      setReady(true);
    };
    const off = window.appLanguage.onChange((locale) => {
      changed = true;
      apply(locale);
    });
    void window.appLanguage.get().then((locale) => {
      if (!changed) apply(locale);
    });
    return () => {
      alive = false;
      off();
    };
  }, []);
  return <I18nextProvider i18n={i18n}>{ready ? children : null}</I18nextProvider>;
}
// This boundary renders the application tree on language changes without remounting it.
export function useAppLanguage() {
  useTranslation();
}
