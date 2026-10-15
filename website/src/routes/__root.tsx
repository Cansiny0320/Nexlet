import { SiteLanguage, useSiteTranslation, LocaleLink } from '../components/site-language';
import { basePath, localeFromPath } from '../lib/i18n';
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useRouterState,
} from '@tanstack/react-router';
import { useHydrated } from '../lib/use-hydrated';
import { SiteProvider } from '../components/site-provider';
import { SiteShell } from '../components/site-shell';
import { pages } from '../lib/pages';
import css from '../styles/app.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'theme-color', content: '#f7f7f5' },
    ],
    links: [
      { rel: 'stylesheet', href: css },
      { rel: 'icon', href: '/assets/icon.svg', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/assets/icon.png' },
      {
        rel: 'preload',
        href: '/assets/noto-sans-sc.woff2',
        as: 'font',
        type: 'font/woff2',
        crossOrigin: 'anonymous',
      },
    ],
  }),
  component: Root,
  notFoundComponent: NotFound,
});
function Root() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const page = pages.find((page) => page.path === basePath(path));
  const hydrated = useHydrated();
  return (
    <html lang={localeFromPath(path)} className={hydrated ? 'js' : undefined}>
      <head>
        <HeadContent />
      </head>
      <body className={page?.className}>
        <SiteLanguage locale={localeFromPath(path)}>
          <SiteProvider path={basePath(path)}>
            <SiteShell path={path}>
              <Outlet />
            </SiteShell>
          </SiteProvider>
        </SiteLanguage>
        <Scripts />
      </body>
    </html>
  );
}
function NotFound() {
  const { t } = useSiteTranslation();
  return (
    <section className="shell document">
      <title>{t('页面不存在 — Nexlet')}</title>
      <meta name="robots" content="noindex" />
      <p className="eyebrow">404</p>
      <h1>{t('页面不存在')}</h1>
      <LocaleLink className="button primary" to="/">
        {t('返回首页')}
      </LocaleLink>
    </section>
  );
}
