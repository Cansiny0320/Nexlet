export const SYNC_CATEGORIES = [
  'settings',
  'commands',
  'pinned',
  'webShortcuts',
  'bookmarks',
  'snippets',
  'aiActions',
  'aiModels',
  'pads',
  'notes',
  'plugins',
  'clipboardFavorites',
  'clipboardImages',
  'clipboardHistory',
] as const;
export type SyncCategory = (typeof SYNC_CATEGORIES)[number];
export interface SyncEntity {
  kind: SyncCategory;
  id: string;
  value: unknown;
}
export interface SyncRecord extends SyncEntity {
  revision: number;
  schema: 1;
  deleted: boolean;
}
export interface SyncMutation extends SyncEntity {
  mutationId: string;
  baseRevision: number;
  schema: 1;
  deleted: boolean;
}
export interface SyncConflict {
  key: string;
  local: SyncMutation;
  remote: SyncRecord;
}
export interface SyncState {
  enabled: SyncCategory[];
  cursor: number;
  used: number;
  quota: number;
  entries: Record<string, { seen: string; revision: number }>;
  outbox: Record<string, SyncMutation>;
  conflicts: Record<string, SyncConflict>;
}
export interface AccountState {
  user: { id: string; name: string; image?: string | null } | null;
  login?: { code: string; expiresAt: number };
  enabled: SyncCategory[];
  pending: number;
  conflicts: SyncConflict[];
  used: number;
  quota: number;
  running: boolean;
  error: string;
  persistent: boolean;
  devices: {
    id: string;
    createdAt: string;
    expiresAt: string;
    userAgent: string | null;
    current: boolean;
  }[];
  pluginSuggestions: { id: string; version: string; enabled: boolean }[];
  mappings: { id: string; platform: string; path?: string; name?: string; shortcut?: string }[];
}
export type AccountAction =
  | { action: 'state' | 'login' | 'cancel' | 'logout' | 'sync' | 'devices' | 'delete' }
  | { action: 'categories'; enabled: SyncCategory[] }
  | { action: 'revoke'; id: string }
  | { action: 'mapping'; id: string; path?: string; shortcut?: string }
  | { action: 'resolve'; key: string; choice: 'local' | 'remote' };
export const syncLabels: Record<SyncCategory, string> = {
  settings: '外观与通用设置',
  commands: '指令偏好',
  pinned: '固定项',
  webShortcuts: '网页搜索入口',
  bookmarks: '网页书签',
  snippets: '快捷短语',
  aiActions: 'AI 动作定义',
  aiModels: '共享 AI 模型配置',
  pads: '计算稿纸',
  notes: '便笺',
  plugins: '插件清单',
  clipboardFavorites: '剪贴板收藏文本',
  clipboardImages: '剪贴板图片',
  clipboardHistory: '剪贴板历史与文件元数据',
};
