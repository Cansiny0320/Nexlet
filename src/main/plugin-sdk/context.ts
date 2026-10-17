import { t } from '../../shared/i18n';
import type { WebContents, BrowserWindow, Session } from 'electron';
import type { PluginPermission, PluginRecord } from '../../shared/types';

export interface SdkCaller {
  record: PluginRecord;
  contents: WebContents;
  owner: BrowserWindow;
  hostOwner?: BrowserWindow;
  isolated: Session;
}
export interface SdkContext extends SdkCaller {
  plugin: string;
  require(permission: PluginPermission): void;
  emit(event: string, value: unknown): void;
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(t('参数必须为对象'));
  return value as Record<string, unknown>;
}
export function string(value: unknown, max = 4096): string {
  if (typeof value !== 'string' || !value || value.length > max || value.includes('\0'))
    throw new Error(t('字符串参数无效'));
  return value;
}
