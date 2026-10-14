import site from '../../site.json';
import { pages } from './pages';
export function pageHead(path: (typeof pages)[number]['path']) {
  const page = pages.find((page) => page.path === path)!;
  const url = site.origin + path;
  const graph: Record<string, unknown>[] = [
    {
      '@type': 'WebSite',
      '@id': site.origin + '/#website',
      url: site.origin + '/',
      name: 'Nexlet',
      inLanguage: 'zh-CN',
    },
    {
      '@type': 'WebPage',
      '@id': url + '#webpage',
      url,
      name: page.title,
      description: page.description,
      inLanguage: 'zh-CN',
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
      description:
        'Nexlet 是面向 Windows 和 macOS 的桌面工具箱，提供应用快捷方式搜索、剪贴板历史、计算稿纸和常用开发工具。目前处于预览阶段。',
      image: site.origin + '/assets/launcher.png',
      screenshot: site.origin + '/assets/launcher.png',
      sameAs: site.repository,
      featureList: [
        '应用快捷方式搜索',
        '剪贴板历史',
        '计算稿纸',
        'JSON 格式化与校验',
        'URL 与 Base64 编解码',
        '时间戳转换',
        'UUID v4',
        '网页快开',
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
      { property: 'og:locale', content: 'zh_CN' },
      { property: 'og:title', content: page.title },
      { property: 'og:description', content: page.description },
      { property: 'og:url', content: url },
      { property: 'og:image', content: site.origin + '/assets/social.png' },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      {
        property: 'og:image:alt',
        content: 'Nexlet 桌面工具箱：常用工具，随叫随到。桌面工具功能示意。',
      },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: page.title },
      { name: 'twitter:description', content: page.description },
      { name: 'twitter:image', content: site.origin + '/assets/social.png' },
    ],
    links: [{ rel: 'canonical', href: url }],
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
