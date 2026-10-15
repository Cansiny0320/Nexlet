import type { PluginLocales } from './plugin-locales';
import type { Language } from './i18n';
import type {PanelConfig,PanelStatus} from './super-panel';
import type { CommandConfig, ShortcutStatus } from './command-config';
import type { ContentMatch } from './launch';
export type Theme = 'system' | 'light' | 'dark';
export type ClipKind = 'text' | 'image' | 'files';
export interface ClipItem { id: string; kind: ClipKind; text: string; hash: string; createdAt: number; favorite: boolean; files?: string[]; imagePath?: string; thumbnail?: string; width?: number; height?: number; }
export interface CalcLine { id: string; expression: string; note: string; }
export interface Scratchpad { id: string; name: string; createdAt: number; updatedAt: number; locked: boolean; color: string; lines: CalcLine[]; }
export interface WebShortcut { id: string; name: string; url: string; type?: 'fixed' | 'search'; }
export interface Settings { language: Language; shortcut: string; theme: Theme; hideOnBlur: boolean; autoCheckUpdates: boolean; clipboardEnabled: boolean; maxClipboardItems: number; retentionDays: number; searchPaths: string[]; fileSearchPaths: string[]; webShortcuts: WebShortcut[]; }
export interface Command { id: string; name: string; subtitle: string; kind: 'tool' | 'app' | 'shortcut' | 'plugin' | 'web' | 'match' | 'system' | 'local'; keywords: string[]; icon?: string; color?: string; path?: string; pluginId?: string; feature?: string; payload?: string; inputId?:string; matches?:ContentMatch[]; }
export type PluginPermission = 'clipboard.read' | 'clipboard.write' | 'shell.openExternal' | 'network.request' | 'secrets' | import('./plugin-api').SdkPermission;
export interface PluginManifest { locales?: PluginLocales; id: string; name: string; version: string; description: string; apiVersion: 1; main: string; backend?: string; icon?: string; permissions: PluginPermission[]; features: { locales?: PluginLocales; code: string; name: string; keywords: string[]; matches?:ContentMatch[] }[]; }
export interface PluginRecord { manifest: PluginManifest; directory: string; enabled: boolean; development: boolean; installedAt: number; source?: 'marketplace' | 'local'; icon?: string; }
export interface StartupStatus { supported: boolean; enabled: boolean; reason: string | null; }
export interface PluginSessionState { id:string; name:string; code:string; detached:boolean; loading:boolean; }
export interface UpdateStatus { mode: 'automatic' | 'portable' | 'unsupported'; phase: 'idle' | 'checking' | 'latest' | 'available' | 'downloading' | 'downloaded' | 'installing' | 'error'; version: string | null; notes: string; percent: number | null; transferred?: number | null; total?: number | null; bytesPerSecond?: number | null; error: string | null; }
export interface AppState { panelConfig:PanelConfig; panelStatus:PanelStatus; commandConfig:CommandConfig; commandCatalog:Command[]; shortcutStatuses:Record<string,ShortcutStatus>; update: UpdateStatus; version: string; platform: string; settings: Settings; startup: StartupStatus; pinned: string[]; recent: string[]; commands: Command[]; plugins: PluginRecord[]; shortcutError: string | null; catalogLoading: boolean; nativeStatus: string | null; canPaste: boolean; }
export const DEFAULT_SETTINGS: Settings = { language: 'system', shortcut: 'Alt+Space', theme: 'system', hideOnBlur: true, autoCheckUpdates: true, clipboardEnabled: true, maxClipboardItems: 500, retentionDays: 30, searchPaths: [], fileSearchPaths: [], webShortcuts: [] };
export const BUILTIN_COMMANDS: Command[] = [
  { id: 'tool:clipboard', name: '剪贴板', subtitle: '历史记录、收藏与悬浮中转', kind: 'tool', keywords: ['剪切板', 'clipboard', 'jtb'], color: '#6962ff' },
  { id: 'tool:scratchpad', name: '计算稿纸', subtitle: '随手计算，自动保存每一步', kind: 'tool', keywords: ['计算器', 'calculator', 'jsgz'], color: '#ff9c00' },
  { id: 'tool:plugins', name: '插件管理', subtitle: '安装和管理 Nexlet 插件', kind: 'tool', keywords: ['插件', 'plugins'], color: '#8e85dd' },
  { id: 'tool:web', name: '网页快开', subtitle: '管理常用网站快捷方式', kind: 'tool', keywords: ['网站', 'bookmark', 'url'], color: '#3188ef' },
  { id: 'tool:json', name: 'JSON 工具', subtitle: '格式化、校验与 JSON 对比', kind: 'tool', keywords: ['json', '格式化', 'JSON 格式化', 'diff', '对比'], color: '#42a869' },
  { id: 'tool:filesearch', name: '文件搜索', subtitle: '通过 Everything 搜索本机文件', kind: 'tool', keywords: ['everything', '文件', '搜索', 'wenjian', 'wjss'], color: '#e19c36' },
  { id: 'tool:timestamp', name: '时间戳', subtitle: '日期与 Unix 时间戳转换', kind: 'tool', keywords: ['timestamp', '日期'], color: '#ef6863' },
  { id: 'tool:encoding', name: '编码转换', subtitle: 'URL 与 Base64 编解码', kind: 'tool', keywords: ['base64', 'urlencode', '编码'], color: '#558e9b' },
  { id: 'tool:uuid', name: 'UUID', subtitle: '生成随机 UUID', kind: 'tool', keywords: ['uuid', '随机数'], color: '#3387f7' },
  { id: 'tool:settings', name: '设置', subtitle: '快捷键、外观与数据', kind: 'tool', keywords: ['preferences', 'settings'], color: '#7f8995' }
];
export const HOST_ACTIONS = ['state', 'panel', 'selectionInput', 'commandConfig', 'localPick', 'webShortcut', 'catalogIcons', 'search', 'launchInput', 'clearInput', 'launch', 'pin', 'window', 'settings', 'startup', 'rescan', 'pickSearchPath', 'clips', 'clipAction', 'pads', 'savePad', 'deletePad', 'exportPad', 'pluginInstall', 'pluginToggle', 'pluginRemove', 'pluginInspect', 'pluginSession', 'toolSession', 'marketplace', 'marketInstall', 'fileSearch', 'fileSearchStatus', 'fileBrowse', 'fileInfo', 'fileAction', 'openData', 'updateReady','updateCheck', 'updateDownload', 'updateInstall', 'updatePortable'] as const;
export type HostAction = typeof HOST_ACTIONS[number];
export interface HostApi { pathForFile(file:File):string; call<T = unknown>(action: HostAction, payload?: unknown): Promise<T>; onChange(callback: (event: string) => void): () => void; }
declare global { interface Window { nexlet: HostApi; } }
