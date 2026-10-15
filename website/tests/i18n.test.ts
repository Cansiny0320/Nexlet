import { describe, expect, it } from 'vitest';
import {
  basePath,
  createTranslator,
  documentLink,
  localeFromPath,
  localizedPath,
} from '../src/lib/i18n';
import { pageHead } from '../src/lib/seo';

describe('localized URLs and isolated server translations', () => {
  it('preserves the page when switching languages and rejects lookalike prefixes', () => {
    expect(localeFromPath('/en/download/')).toBe('en');
    expect(localeFromPath('/zh-Hant/plugins/')).toBe('zh-Hant');
    expect(localeFromPath('/english/')).toBe('zh-CN');
    expect(basePath('/en/download/')).toBe('/download/');
    expect(localizedPath('/en/download/', 'zh-Hant')).toBe('/zh-Hant/download/');
    expect(localizedPath('/zh-Hant/plugins/', 'zh-CN')).toBe('/plugins/');
    expect(documentLink('https://example.test/README.md#start', 'en')).toBe(
      'https://example.test/README.en.md#start',
    );
  });
  it('renders independent languages without changing another request', async () => {
    const en = createTranslator('en'),
      traditional = createTranslator('zh-Hant');
    expect(en.t('下载 Nexlet')).toBe('Download Nexlet');
    expect(traditional.t('下载 Nexlet')).toBe('下載 Nexlet');
    await traditional.changeLanguage('zh-CN');
    expect(en.t('下载 Nexlet')).toBe('Download Nexlet');
  });
  it('provides localized titles, canonical URLs and all language alternates', () => {
    for (const locale of ['zh-CN', 'zh-Hant', 'en'] as const) {
      const head = pageHead('/download/', locale);
      expect(head.links.find((link) => link.rel === 'canonical')?.href).toContain(
        localizedPath('/download/', locale),
      );
      expect(head.links.filter((link) => link.rel === 'alternate')).toHaveLength(4);
      const json = JSON.parse(head.scripts[0].children);
      expect(
        json['@graph'].find((entry: { '@type': string }) => entry['@type'] === 'WebPage')
          .inLanguage,
      ).toBe(locale);
    }
  });
});
