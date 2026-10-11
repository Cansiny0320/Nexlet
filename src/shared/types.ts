export type Theme = 'system' | 'light' | 'dark';
export type ClipKind = 'text' | 'image' | 'files';
export interface ClipItem { id: string; kind: ClipKind; text: string; hash: string; createdAt: number; favorite: boolean; files?: string[]; imagePath?: string; thumbnail?: string; width?: number; height?: number; }
export interface CalcLine { id: string; expression: string; note: string; }
export interface Scratchpad { id: string; name: string; createdAt: number; updatedAt: number; locked: boolean; color: string; lines: CalcLine[]; }
export interface WebShortcut { id: string; name: string; url: string; }
export interface Settings { shortcut: string; theme: Theme; hideOnBlur: boolean; clipboardEnabled: boolean; maxClipboardItems: number; retentionDays: number; searchPaths: string[]; webShortcuts: WebShortcut[]; }
export interface Command { id: string; name: string; subtitle: string; kind: 'tool' | 'app' | 'shortcut' | 'plugin' | 'web' | 'match'; keywords: string[]; icon?: string; color?: string; path?: string; pluginId?: string; feature?: string; payload?: string; }
export type PluginPermission = 'clipboard.read' | 'clipboard.write' | 'shell.openExternal';
export interface PluginManifest { id: string; name: string; version: string; description: string; apiVersion: 1; main: string; permissions: PluginPermission[]; features: { code: string; name: string; keywords: string[] }[]; }
export interface PluginRecord { manifest: PluginManifest; directory: string; enabled: boolean; development: boolean; installedAt: number; }
export interface AppState { version: string; platform: string; settings: Settings; pinned: string[]; recent: string[]; commands: Command[]; plugins: PluginRecord[]; shortcutError: string | null; catalogLoading: boolean; nativeStatus: string | null; canPaste: boolean; }
export const DEFAULT_SETTINGS: Settings = { shortcut: 'Alt+Space', theme: 'system', hideOnBlur: true, clipboardEnabled: true, maxClipboardItems: 500, retentionDays: 30, searchPaths: [], webShortcuts: [] };
export const BUILTIN_COMMANDS: Command[] = [
  { id: 'tool:clipboard', name: '剪贴板', subtitle: '历史记录、收藏与悬浮中转', kind: 'tool', keywords: ['剪切板', 'clipboard', 'jtb'], color: '#6962ff' },
  { id: 'tool:scratchpad', name: '计算稿纸', subtitle: '随手计算，自动保存每一步', kind: 'tool', keywords: ['计算器', 'calculator', 'jsgz'], color: '#ff9c00' },
  { id: 'tool:plugins', name: '插件管理', subtitle: '安装和管理 Nexlet 插件', kind: 'tool', keywords: ['插件', 'plugins'], color: '#8e85dd' },
  { id: 'tool:web', name: '网页快开', subtitle: '管理常用网站快捷方式', kind: 'tool', keywords: ['网站', 'bookmark', 'url'], color: '#3188ef' },
  { id: 'tool:json', name: 'JSON 格式化', subtitle: '格式化、压缩和校验 JSON', kind: 'tool', keywords: ['json', '格式化'], color: '#42a869' },
  { id: 'tool:timestamp', name: '时间戳', subtitle: '日期与 Unix 时间戳转换', kind: 'tool', keywords: ['timestamp', '日期'], color: '#ef6863' },
  { id: 'tool:encoding', name: '编码转换', subtitle: 'URL 与 Base64 编解码', kind: 'tool', keywords: ['base64', 'urlencode', '编码'], color: '#558e9b' },
  { id: 'tool:uuid', name: 'UUID', subtitle: '生成随机 UUID', kind: 'tool', keywords: ['uuid', '随机数'], color: '#3387f7' },
  { id: 'tool:settings', name: '设置', subtitle: '快捷键、外观与数据', kind: 'tool', keywords: ['preferences', 'settings'], color: '#7f8995' }
];
export const HOST_ACTIONS = ['state', 'search', 'launch', 'pin', 'window', 'settings', 'rescan', 'pickSearchPath', 'clips', 'clipAction', 'pads', 'savePad', 'deletePad', 'exportPad', 'pluginInstall', 'pluginToggle', 'pluginRemove', 'pluginInspect', 'openData'] as const;
export type HostAction = typeof HOST_ACTIONS[number];
export interface HostApi { pathForFile(file:File):string; call<T = unknown>(action: HostAction, payload?: unknown): Promise<T>; onChange(callback: (event: string) => void): () => void; }
declare global { interface Window { nexlet: HostApi; } }
