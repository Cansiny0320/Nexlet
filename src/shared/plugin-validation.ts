import type { PluginManifest, PluginPermission } from './types';

export const KNOWN_PERMISSIONS: PluginPermission[] = ['clipboard.read', 'clipboard.write', 'shell.openExternal'];
export function safeEntryPath(path: string): string {
  const normalized = path.replaceAll('\\', '/');
  if (!normalized || normalized.length > 240 || /[:\0%]/.test(normalized) || normalized.startsWith('/') || normalized.split('/').some(s => !s || s === '..' || s === '.' || /[. ]$/.test(s) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s))) throw new Error('插件资源路径不安全');
  return normalized;
}
function string(value: unknown, max: number, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label}无效`);
  return value.trim();
}
export function validateManifest(value: unknown): PluginManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('plugin.json 必须为对象');
  const v = value as Record<string, unknown>;
  const id = string(v.id, 100, '插件 ID');
  if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(id)) throw new Error('插件 ID 必须使用反向域名格式');
  const name = string(v.name, 50, '插件名称');
  const version = string(v.version, 50, '插件版本');
  if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version)) throw new Error('版本号必须符合 SemVer');
  if (v.apiVersion !== 1) throw new Error('仅支持 apiVersion: 1');
  const main = safeEntryPath(string(v.main, 240, '插件入口'));
  if (!/\.html$/i.test(main)) throw new Error('插件入口必须是本地 HTML');
  if (!Array.isArray(v.permissions) || v.permissions.some(p => !KNOWN_PERMISSIONS.includes(p))) throw new Error('插件包含不支持的权限');
  if (!Array.isArray(v.features) || !v.features.length || v.features.length > 30) throw new Error('插件需提供 1–30 个功能');
  const codes = new Set<string>();
  const features = v.features.map(item => {
    if (!item || typeof item !== 'object') throw new Error('功能定义无效');
    const code = string(item.code, 40, '功能码');
    if (!/^[a-zA-Z0-9_-]+$/.test(code) || codes.has(code)) throw new Error('功能码无效或重复');
    codes.add(code);
    if (!Array.isArray(item.keywords) || item.keywords.length > 30) throw new Error('功能关键词无效');
    return { code, name: string(item.name, 50, '功能名称'), keywords: item.keywords.map((k: unknown) => string(k, 50, '关键词')) };
  });
  const icon=v.icon===undefined?undefined:safeEntryPath(string(v.icon,240,'插件图标'));
  if(icon&&!/\.png$/i.test(icon))throw new Error('插件图标需要 PNG 文件');
  return { id, name, version, apiVersion: 1, main, ...(icon?{icon}:{}), permissions: [...new Set(v.permissions)] as PluginPermission[], description: typeof v.description === 'string' ? v.description.slice(0, 500) : '', features };
}
