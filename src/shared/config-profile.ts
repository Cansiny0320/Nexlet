import type { Settings, WebShortcut } from './types';
import type { CommandConfig } from './command-config';
import type { PanelConfig } from './super-panel';
import type { Snippet, Workspace } from './productivity';
export interface AiActionDefinition {
  id: string;
  name: string;
  prompt: string;
  model: string;
  baseUrl: string;
}
export interface ProfileCategories {
  settings: Partial<Omit<Settings, 'webShortcuts'>>;
  commands: Omit<CommandConfig, 'pinned' | 'revision'>;
  pinned: string[];
  webShortcuts: WebShortcut[];
  panel: Omit<PanelConfig, 'revision'>;
  snippets: Snippet[];
  workspaces: Workspace[];
  aiActions: AiActionDefinition[];
  plugins: { id: string; version: string; enabled: boolean }[];
}
export type ProfileCategory = keyof ProfileCategories;
export interface ConfigProfile {
  version: 1;
  platform?: string;
  categories: Partial<ProfileCategories>;
}
export interface ProfilePreview {
  token: string;
  changes: { category: ProfileCategory; before: string; after: string }[];
  warnings: string[];
}
export const profileLabels: Record<ProfileCategory, string> = {
  settings: '宿主设置',
  commands: '指令偏好',
  pinned: '固定项',
  webShortcuts: '网页入口',
  panel: '面板设置',
  snippets: '快捷短语',
  workspaces: '工作区',
  aiActions: 'AI 动作定义',
  plugins: '插件清单',
};
