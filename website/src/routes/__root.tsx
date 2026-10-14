import {
  createRootRoute,
  HeadContent,
  Link,
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
  const page = pages.find((page) => page.path === path);
  const hydrated = useHydrated();
  return (
    <html lang="zh-CN" className={hydrated ? 'js' : undefined}>
      <head>
        <HeadContent />
      </head>
      <body className={page?.className}>
        <SiteProvider path={path}>
          <SiteShell path={path}>
            <Outlet />
          </SiteShell>
        </SiteProvider>
        <Scripts />
      </body>
    </html>
  );
}
function NotFound() {
  return (
    <section className="shell document">
      <title>页面不存在 — Nexlet</title>
      <meta name="robots" content="noindex" />
      <p className="eyebrow">404</p>
      <h1>页面不存在</h1>
      <Link className="button primary" to="/">
        返回首页
      </Link>
    </section>
  );
}
