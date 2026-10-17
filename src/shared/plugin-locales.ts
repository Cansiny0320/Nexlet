import { currentLocale, LOCALES, t, type Locale } from './i18n';
export interface LocaleLabels {
  name?: string;
  description?: string;
  category?: string;
}
export type PluginLocales = Partial<Record<Locale, LocaleLabels>>;
export function validatePluginLocales(value: unknown): PluginLocales | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error(t('插件翻译字段无效'));
  const result: PluginLocales = {};
  for (const [locale, labels] of Object.entries(value)) {
    if (
      !LOCALES.includes(locale as Locale) ||
      !labels ||
      typeof labels !== 'object' ||
      Array.isArray(labels)
    )
      throw Error(t('插件翻译字段无效'));
    const entry: LocaleLabels = {};
    for (const [field, text] of Object.entries(labels)) {
      if (
        !['name', 'description', 'category'].includes(field) ||
        typeof text !== 'string' ||
        !text.trim() ||
        text.length > (field === 'description' ? 500 : field === 'category' ? 30 : 50)
      )
        throw Error(t('插件翻译字段无效'));
      entry[field as keyof LocaleLabels] = text;
    }
    result[locale as Locale] = entry;
  }
  return result;
}
export function localizedLabels<T extends LocaleLabels & { locales?: PluginLocales }>(
  value: T,
  locale = currentLocale(),
): T {
  return { ...value, ...value.locales?.['zh-CN'], ...value.locales?.[locale] };
}
export function localizedKeywords(value: {
  name: string;
  keywords: string[];
  locales?: PluginLocales;
}): string[] {
  return [
    ...new Set([
      value.name,
      ...value.keywords,
      ...Object.values(value.locales || {}).flatMap((labels) =>
        labels?.name ? [labels.name] : [],
      ),
    ]),
  ];
}
