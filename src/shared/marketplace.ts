import { validatePluginLocales, type PluginLocales } from './plugin-locales';
import { t } from './i18n';
import { valid, gte, gt } from 'semver';
import { KNOWN_PERMISSIONS } from './plugin-validation';
import type { PluginPermission } from './types';

export const MARKET_INDEX_URL =
  'https://raw.githubusercontent.com/Cansiny0320/Nexlet-plugins/main/index.json';
export interface MarketEntry {
  updatedAt?: string;
  readme?: string;
  source?: string;
  screenshots?: string[];
  changelog?: { version: string; date?: string; notes: string }[];
  permissions?: PluginPermission[];
  locales?: PluginLocales;
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  category: string;
  platforms: string[];
  minHostVersion?: string;
  download: string;
  icon?: string;
}
export interface MarketIndex {
  schemaVersion: 1;
  plugins: MarketEntry[];
}
export interface MarketState {
  entries: MarketEntry[];
  fetchedAt: number | null;
  cached: boolean;
  error: string | null;
}
export interface MarketTask {
  id: string;
  pluginId: string;
  name: string;
  version?: string;
  state: 'queued' | 'downloading' | 'ready' | 'installing' | 'done' | 'failed' | 'cancelled';
  received: number;
  total?: number;
  error?: string;
  permissions?: PluginPermission[];
  addedPermissions?: PluginPermission[];
}
export function validateMarketDetails(value: Record<string, unknown>): Partial<MarketEntry> {
  const result: Partial<MarketEntry> = {};
  const url = (value: unknown) => {
    if (typeof value !== 'string' || value.length > 2048) throw new Error(t('市场链接无效'));
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash)
      throw new Error(t('市场链接必须为 HTTPS'));
    return parsed.href;
  };
  const date = (value: unknown) => {
    if (typeof value !== 'string' || value.length > 40 || !Number.isFinite(Date.parse(value)))
      throw new Error(t('市场日期无效'));
    return value;
  };
  if (value.updatedAt !== undefined) result.updatedAt = date(value.updatedAt);
  if (value.readme !== undefined) {
    if (typeof value.readme !== 'string' || value.readme.length > 30000)
      throw new Error(t('插件说明过长'));
    result.readme = value.readme;
  }
  if (value.source !== undefined) result.source = url(value.source);
  if (value.screenshots !== undefined) {
    if (!Array.isArray(value.screenshots) || value.screenshots.length > 6)
      throw new Error(t('预览图数量无效'));
    result.screenshots = value.screenshots.map(url);
  }
  if (value.changelog !== undefined) {
    if (!Array.isArray(value.changelog) || value.changelog.length > 20)
      throw new Error(t('版本日志过长'));
    result.changelog = value.changelog.map((item) => {
      if (
        !item ||
        !valid(item.version) ||
        typeof item.notes !== 'string' ||
        item.notes.length > 4000
      )
        throw new Error(t('版本日志无效'));
      return {
        version: item.version,
        notes: item.notes,
        ...(item.date === undefined ? {} : { date: date(item.date) }),
      };
    });
  }
  if (value.permissions !== undefined) {
    if (
      !Array.isArray(value.permissions) ||
      value.permissions.some((p) => !KNOWN_PERMISSIONS.includes(p))
    )
      throw new Error(t('市场权限声明无效'));
    result.permissions = [...new Set(value.permissions)] as PluginPermission[];
  }
  return result;
}
export function isMarketDownload(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.origin === 'https://github.com' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^\/Cansiny0320\/Nexlet-plugins\/releases\/download\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+\.(?:nexlet|zip)$/.test(
        url.pathname,
      )
    );
  } catch {
    return false;
  }
}
export function validateMarketIndex(value: unknown): MarketIndex {
  if (
    !value ||
    typeof value !== 'object' ||
    (value as any).schemaVersion !== 1 ||
    !Array.isArray((value as any).plugins) ||
    (value as any).plugins.length > 200
  )
    throw new Error(t('插件市场索引格式不支持'));
  const seen = new Set<string>();
  const str = (v: unknown, max: number) => {
    if (typeof v !== 'string' || !v.trim() || v.length > max)
      throw new Error(t('插件市场字段无效'));
    return v;
  };
  const plugins = (value as any).plugins.map((v: any): MarketEntry => {
    if (!v || typeof v !== 'object') throw new Error(t('插件条目无效'));
    const id = str(v.id, 100),
      version = str(v.version, 50),
      download = str(v.download, 2048);
    if (
      !/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(id) ||
      seen.has(id) ||
      !valid(version) ||
      !isMarketDownload(download)
    )
      throw new Error(t('插件标识、版本或下载地址无效'));
    seen.add(id);
    if (
      !Array.isArray(v.platforms) ||
      !v.platforms.length ||
      v.platforms.some((p: unknown) => !['win32', 'darwin', 'linux'].includes(p as string))
    )
      throw new Error(t('插件支持平台无效'));
    if (v.minHostVersion !== undefined && !valid(v.minHostVersion))
      throw new Error(t('最低主程序版本无效'));
    if (
      v.icon !== undefined &&
      (typeof v.icon !== 'string' ||
        v.icon.length > 100000 ||
        !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v.icon))
    )
      throw new Error(t('插件图标无效'));
    return {
      ...validateMarketDetails(v),
      ...(v.locales === undefined ? {} : { locales: validatePluginLocales(v.locales) }),
      id,
      name: str(v.name, 50),
      description: str(v.description, 500),
      version,
      author: str(v.author, 80),
      category: str(v.category, 30),
      platforms: [...new Set(v.platforms)] as string[],
      download,
      ...(v.minHostVersion ? { minHostVersion: v.minHostVersion } : {}),
      ...(v.icon ? { icon: v.icon } : {}),
    };
  });
  return { schemaVersion: 1, plugins };
}
export function marketAvailability(
  entry: MarketEntry,
  platform: string,
  host: string,
  installed?: { development: boolean; version: string },
): string | null {
  if (!entry.platforms.includes(platform)) return t('此插件不支持当前平台');
  if (entry.minHostVersion && !gte(host, entry.minHostVersion))
    return t('需要 Nexlet {{v0}} 或更高版本', { v0: entry.minHostVersion });
  if (installed?.development) return t('开发目录插件请通过本地方式更新');
  if (installed && (!valid(installed.version) || !gt(entry.version, installed.version)))
    return t('已安装相同或更新版本');
  return null;
}
