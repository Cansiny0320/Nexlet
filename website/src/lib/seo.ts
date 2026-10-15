import { createTranslator, localizedPath, locales, type Locale } from './i18n';
import site from '../../site.json';
import { pages } from './pages';
export function pageHead(path: (typeof pages)[number]['path'], locale: Locale = 'zh-CN') {
  const { t } = createTranslator(locale);
  const source = pages.find((page) => page.path === path)!;
  const page = { ...source, title: t(source.title), description: t(source.description) };
  const url = site.origin + localizedPath(path, locale);
  const social =
    site.origin + (locale === 'zh-CN' ? '/assets/social.png' : `/assets/social-${locale}.png`);
  const graph: Record<string, unknown>[] = [
    {
      '@type': 'WebSite',
      '@id': site.origin + '/#website',
      url: site.origin + localizedPath('/', locale),
      name: 'Nexlet',
      inLanguage: locale,
    },
    {
      '@type': 'WebPage',
      '@id': url + '#webpage',
      url,
      name: page.title,
      description: page.description,
      inLanguage: locale,
      isPartOf: { '@id': site.origin + '/#website' },
    },
  ];
  if (path === '/')
    graph.push({
      '@type': 'SoftwareApplication',
      '@id': site.origin + '/#software',
      name: 'Nexlet',
      url,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Windows, macOS',
      description: t(
        'Nexlet 是面向 Windows 和 macOS 的桌面工具箱，提供应用快捷方式搜索、剪贴板历史、计算稿纸和常用开发工具。目前处于预览阶段。',
      ),
      image:
        site.origin +
        (locale === 'zh-CN' ? '/assets/launcher.png' : `/assets/launcher-${locale}.png`),
      screenshot:
        site.origin +
        (locale === 'zh-CN' ? '/assets/launcher.png' : `/assets/launcher-${locale}.png`),
      sameAs: site.repository,
      featureList: [
        t('应用快捷方式搜索'),
        t('剪贴板历史'),
        t('计算稿纸'),
        t('JSON 格式化与校验'),
        t('URL 与 Base64 编解码'),
        t('时间戳转换'),
        'UUID v4',
        t('网页快开'),
        'Nexlet Plugin API v1',
      ],
    });
  return {
    meta: [
      { title: page.title },
      { name: 'description', content: page.description },
      { name: 'robots', content: 'index, follow, max-image-preview:large' },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'Nexlet' },
      {
        property: 'og:locale',
        content: locale === 'en' ? 'en_US' : locale === 'zh-Hant' ? 'zh_TW' : 'zh_CN',
      },
      { property: 'og:title', content: page.title },
      { property: 'og:description', content: page.description },
      { property: 'og:url', content: url },
      { property: 'og:image', content: social },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      {
        property: 'og:image:alt',
        content: t('Nexlet 桌面工具箱：常用工具，随叫随到。桌面工具功能示意。'),
      },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: page.title },
      { name: 'twitter:description', content: page.description },
      { name: 'twitter:image', content: social },
    ],
    links: [
      { rel: 'canonical', href: url },
      ...locales.map((language) => ({
        rel: 'alternate',
        hrefLang: language,
        href: site.origin + localizedPath(path, language),
      })),
      { rel: 'alternate', hrefLang: 'x-default', href: site.origin + path },
    ],
    scripts: [
      {
        type: 'application/ld+json',
        children: JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replaceAll(
          '<',
          '\\u003c',
        ),
      },
    ],
  };
}
