import { createContext, useContext, useMemo, type ReactNode, type ComponentProps } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { createTranslator, type Locale, type PagePath } from '../lib/i18n';
const LocaleContext = createContext({
  locale: 'zh-CN' as Locale,
  instance: createTranslator('zh-CN'),
});
export function SiteLanguage({ locale, children }: { locale: Locale; children: ReactNode }) {
  const instance = useMemo(() => createTranslator(locale), [locale]);
  return (
    <LocaleContext.Provider value={{ locale, instance }}>
      <I18nextProvider i18n={instance}>{children}</I18nextProvider>
    </LocaleContext.Provider>
  );
}
export function useSiteTranslation() {
  const { locale, instance } = useContext(LocaleContext);
  const { t } = useTranslation(undefined, { i18n: instance });
  return { t, locale };
}
type LinkProps = Omit<ComponentProps<'a'>, 'href'> & {
  to: PagePath;
  locale?: Locale;
  activeOptions?: { exact?: boolean };
};
export function LocaleLink({ to, locale: explicit, ...props }: LinkProps) {
  const current = useContext(LocaleContext),
    locale = explicit || current.locale;
  if (locale === 'zh-CN') return <Link {...props} to={to} />;
  const target = ('/$locale' + to) as '/$locale/' | '/$locale/download/' | '/$locale/plugins/';
  return <Link {...props} to={target} params={{ locale }} />;
}
