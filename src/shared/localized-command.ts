import type { Command } from './types';
import { i18n, LOCALES, t } from './i18n';

/** Only call for product-owned labels. User/app names must remain untouched. */
export function commandNames(source: string): string[] {
  return [
    ...new Set([
      source,
      ...LOCALES.map((locale) => String(i18n.getFixedT(locale)(source, { defaultValue: source }))),
    ]),
  ];
}
export function localizeCommand(command: Command): Command {
  return {
    ...command,
    name: t(command.name),
    subtitle: t(command.subtitle || ''),
    keywords: [...new Set([...command.keywords, ...commandNames(command.name)])],
  };
}
