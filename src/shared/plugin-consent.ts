import { t } from './i18n';
import type { PluginManifest } from './types';
export function pluginConsentChanges(
  previous: PluginManifest | undefined,
  next: PluginManifest,
): string[] {
  const changes = next.permissions
    .filter((permission) => !previous?.permissions.includes(permission))
    .map((permission) => t('权限：') + permission);
  for (const provider of next.providers ?? []) {
    const old = previous?.providers?.find((p) => p.id === provider.id);
    if (old?.locality === 'local' && provider.locality === 'cloud')
      changes.push(t('提供商将使用云端：') + provider.name);
  }
  return changes;
}
