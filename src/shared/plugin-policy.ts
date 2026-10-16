import type { PluginPermission } from './types';
export const PLUGIN_ARCHIVE_LIMIT = 64 * 1024 * 1024;
export const PLUGIN_TOTAL_LIMIT = 128 * 1024 * 1024;
export const PLUGIN_FILE_LIMIT = 32 * 1024 * 1024;

export function pluginCsp(permissions: readonly PluginPermission[]): string {
  const compute = permissions.includes('runtime.compute');
  return `default-src 'none'; script-src 'self'${compute ? " 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src ${compute ? "'self' data:" : "'none'"}; worker-src ${compute ? "'self'" : "'none'"}; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
}
