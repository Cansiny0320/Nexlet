import path from 'node:path';

interface ShortcutTarget { target: string; args?: string; }

// Match entry names and target basenames, never parent folders: a normal app
// can live inside a folder named Help or Documentation.
function isDocumentationName(name: string): boolean {
  const words = name.replace(/([a-z])([A-Z])/g, '$1 $2');
  return /(?:^|[\s._-])(?:read[\s._-]*me|change[\s._-]*log|release[\s._-]*notes?|documentation|module[\s._-]+docs|faqs?)(?=$|[\s._()\d-])/i.test(words)
    || /帮助文档|幫助文件|使用说明|使用說明|用户手册|用戶手冊|更新日志|更新日誌|发行说明|發行說明/.test(name);
}

export function isAuxiliaryWindowsShortcut(name: string, link?: ShortcutTarget): boolean {
  if (/(?:^|[\s._-])uninstall(?=$|[\s._()-])/i.test(name) || /卸载|卸載/.test(name)) return true;
  if (isDocumentationName(name)) return true;
  const target = path.win32.basename(link?.target || '');
  const args = link?.args || '';
  if (/(?:^unins\d*|uninst|uninstall(?:_complete)?)\.exe$/i.test(target)) return true;
  if (/(?:^|\s)(?:--?(?:uninstall|mod=uninstall)|\/uninstall)(?=$|\s)/i.test(args)) return true;
  if (/^msiexec\.exe$/i.test(target) && /(?:^|\s)\/x(?=$|\s|\{|")/i.test(args)) return true;
  if (/\.(chm|hlp)$/i.test(target)) return true;
  if (/\.(txt|md|rtf|pdf|html?|url)$/i.test(target) && isDocumentationName(target)) return true;
  // Help viewers and assistance applications are useful apps, not documents.
  return !/\.(exe|msc|cpl)$/i.test(target)
    && /(?:^|[\s._-])(?:help|manual|user[\s._-]+guide)(?:\s*\([^)]*\))?$/i.test(name);
}
