import { describe, expect, it } from 'vite-plus/test';
import { resolveLocale, validLanguage, createTranslator, setLocale } from '../src/shared/i18n';
import { DEFAULT_SETTINGS, BUILTIN_COMMANDS } from '../src/shared/types';

describe('application language', () => {
  it('resolves system regions and scripts without confusing Traditional Chinese with English', () => {
    expect(resolveLocale('system', 'zh-TW')).toBe('zh-Hant');
    expect(resolveLocale('system', 'zh_HK')).toBe('zh-Hant');
    expect(resolveLocale('system', 'zh-Hant-MO')).toBe('zh-Hant');
    expect(resolveLocale('system', 'zh-Hans-SG')).toBe('zh-CN');
    expect(resolveLocale('system', 'de-DE')).toBe('en');
    expect(resolveLocale('en', 'zh-CN')).toBe('en');
    expect(resolveLocale('zh-Hant', 'en-US')).toBe('zh-Hant');
  });
  it('keeps old settings compatible and rejects unknown explicit preferences', () => {
    expect(DEFAULT_SETTINGS.language).toBe('system');
    expect(validLanguage('zh-Hant')).toBe(true);
    expect(validLanguage('auto')).toBe(false);
  });
  it('isolates translator instances and interpolates values without translating user content', () => {
    const en = createTranslator('en'),
      zh = createTranslator('zh-CN');
    expect(en.t('保存')).toBe('Save');
    expect(zh.t('保存')).toBe('保存');
    expect(en.t('已复制 {{v0}}', { v0: '中文用户内容' })).toBe('Copied 中文用户内容');
    expect(en.t('Missing diagnostic')).toBe('Missing diagnostic');
  });
});

import { validateManifest } from '../src/shared/plugin-validation';
import { localizedLabels } from '../src/shared/plugin-locales';
import { localizeCommand } from '../src/shared/localized-command';
import { searchCommands } from '../src/shared/search';

describe('localized command metadata', () => {
  it('preserves legacy manifests and validates optional localized labels', () => {
    const manifest = {
      id: 'org.test.plugin',
      name: 'Original',
      version: '1.0.0',
      apiVersion: 1,
      main: 'index.html',
      permissions: [],
      features: [{ code: 'main', name: 'Main', keywords: [] }],
    };
    expect(validateManifest(manifest).locales).toBeUndefined();
    const localized = validateManifest({
      ...manifest,
      locales: { en: { name: 'English' }, 'zh-Hant': { name: '繁體名稱' } },
    });
    expect(localizedLabels(localized, 'zh-Hant').name).toBe('繁體名稱');
    expect(localized.name).toBe('Original');
    expect(localizedLabels(localized, 'zh-CN').name).toBe('Original');
    expect(() => validateManifest({ ...manifest, locales: { en: { name: 42 } } })).toThrow();
  });
  it('keeps Chinese, English and pinyin searches in every interface language', () => {
    try {
      for (const locale of ['zh-CN', 'zh-Hant', 'en'] as const) {
        setLocale(locale);
        const commands = BUILTIN_COMMANDS.map(localizeCommand);
        for (const query of ['剪贴板', '剪貼簿', 'clipboard', 'jtb'])
          expect(searchCommands(commands, query)[0]?.id).toBe('tool:clipboard');
      }
    } finally {
      setLocale('zh-CN');
    }
  });
});

import enMessages from '../src/shared/locales/en.json';
import traditionalMessages from '../src/shared/locales/zh-Hant.json';
describe('translation quality', () => {
  it('keeps resource coverage and interpolation parameters aligned', () => {
    const tokens = (text: string) =>
      [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();
    for (const [key, message] of Object.entries(enMessages)) {
      if (/_(one|other)$/.test(key)) continue;
      expect(traditionalMessages, key).toHaveProperty(key);
      expect(tokens(message), key).toEqual(tokens(key));
      expect(tokens(traditionalMessages[key as keyof typeof traditionalMessages]), key).toEqual(
        tokens(key),
      );
    }
  });
  it('uses singular and plural English without changing numeric input', () => {
    const en = createTranslator('en');
    expect(en.t('{{v0}} 字符', { v0: '1', count: 1 })).toBe('1 character');
    expect(en.t('{{v0}} 字符', { v0: '1,000', count: 1000 })).toBe('1,000 characters');
    expect(en.t('{{v0}} 分钟前', { v0: 1, count: 1 })).toBe('1 minute ago');
    expect(en.t('{{v0}} 分钟前', { v0: 2, count: 2 })).toBe('2 minutes ago');
  });
});
