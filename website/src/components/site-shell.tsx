import { basePath, languageNames, locales, type PagePath } from '../lib/i18n';
import { useSiteTranslation } from '../components/site-language';
import { LocaleLink as Link } from '../components/site-language';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import site from '../../site.json';
import { Icon } from './icon';
import { useSite } from './site-provider';
import { Button } from './ui/button';

function Brand() {
  return (
    <>
      <span className="brand-symbol" aria-hidden="true">
        N
      </span>
      <span>Nexlet</span>
    </>
  );
}
export function SiteShell({ path, children }: { path: string; children: ReactNode }) {
  const { t, locale } = useSiteTranslation();

  const { hydrated } = useSite();
  const [menu, setMenu] = useState({ path, open: false });
  const menuOpen = menu.path === path && menu.open;
  const setMenuOpen = useCallback((open: boolean) => setMenu({ path, open }), [path]);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 761px)');
    const close = () => setMenuOpen(false);
    query.addEventListener('change', close);
    return () => query.removeEventListener('change', close);
  }, [setMenuOpen]);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [menuOpen, setMenuOpen]);
  return (
    <>
      <a className="skip-link" href="#main">
        {t('跳到主要内容')}
      </a>
      <header className="site-header">
        <div className="shell header-inner">
          <Link className="brand" to="/" aria-label={t('Nexlet 首页')}>
            <Brand />
          </Link>
          <nav id="navigation" className={menuOpen ? 'is-open' : ''} aria-label={t('主导航')}>
            {(
              [
                ['/', t('概览')],
                ['/download/', t('下载')],
                ['/plugins/', t('插件开发')],
              ] as const
            ).map(([to, label]) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: true }}
                onClick={() => setMenuOpen(false)}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="header-actions">
            <nav className="language-switch" aria-label={t('语言')}>
              {locales.map((language) => (
                <Link
                  key={language}
                  to={
                    (['/', '/download/', '/plugins/'].includes(basePath(path))
                      ? basePath(path)
                      : '/') as PagePath
                  }
                  locale={language}
                  hrefLang={language}
                  lang={language}
                  aria-current={locale === language ? 'true' : undefined}
                >
                  {languageNames[language]}
                </Link>
              ))}
            </nav>
            <a className="github-icon" href={site.repository} aria-label={t('GitHub 源代码')}>
              <Icon name="github" />
            </a>
            <Link className="button primary" to="/download/">
              {t('下载 Nexlet')}
            </Link>
          </div>
          <Button
            ref={trigger}
            className="menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="navigation"
            hidden={!hydrated}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {t('菜单')}
            <Icon name="menu" />
          </Button>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <footer className="site-footer">
        <div className="shell footer-inner">
          <Link className="brand" to="/">
            <Brand />
          </Link>
          <div className="footer-links">
            <a href={site.repository}>
              <Icon name="github" /> GitHub
            </a>
            <Link to="/plugins/">{t('插件文档')}</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
