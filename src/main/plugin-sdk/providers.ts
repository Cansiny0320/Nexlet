import { t } from '../../shared/i18n';
import type { PluginSecrets } from '../plugin-secrets';
import { object, string } from './context';
interface Storage { get<T>(key: string, fallback: T): T; set(key: string, value: unknown): void; }
export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
export function providerUrl(value: unknown): URL {
  const url = new URL(string(value, 16384));
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) || url.username || url.password || url.hash || url.search) throw new Error(t("服务地址必须为 HTTPS 或本机 HTTP，不能包含凭据或查询参数"));
  return url;
}
export async function readJson(response: Response, signal: AbortSignal): Promise<Record<string, unknown>> {
  const reader = response.body?.getReader(); if (!reader) throw new Error(t("服务没有响应正文"));
  const chunks: Uint8Array[] = []; let length = 0;
  try { for (;;) { const chunk = await reader.read(); signal.throwIfAborted(); if (chunk.done) break; length += chunk.value.byteLength; if (length > 8 * 1024 * 1024) throw new Error(t("服务响应超过 8 MB")); chunks.push(chunk.value); } }
  catch (error) { await reader.cancel().catch(() => {}); throw error; } finally { reader.releaseLock(); }
  if (!response.ok) throw new Error(t("服务请求失败：HTTP {{v0}}", { v0: response.status }));
  try { return object(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { throw new Error(t("服务返回了无效 JSON 对象")); }
}
export class PluginProviders {
  private revisions = new Map<string, number>();
  constructor(private store: Storage, private secrets: Pick<PluginSecrets, 'set' | 'get'>, readonly fetcher: Fetcher) {}
  revision(plugin: string, kind: 'ai' | 'services'): number { return this.revisions.get(`${plugin}:${kind}`) ?? 0; }
  configure(plugin: string, owner: number, kind: 'ai' | 'services', value: unknown, expectedRevision?: number): { configured: boolean; persistent: boolean } {
    const revision = this.revision(plugin, kind);
    if (expectedRevision !== undefined && revision !== expectedRevision) throw new Error(t("服务配置已变化，请重新登录"));
    if (value === null) { this.store.set(`plugin-provider:${plugin}:${kind}`, null); this.secrets.set(plugin, owner, `sdk.${kind}.key`, null); this.revisions.set(`${plugin}:${kind}`, revision + 1); return { configured: false, persistent: true }; }
    const args = object(value), baseUrl = providerUrl(args.baseUrl).href.replace(/\/$/, '');
    const old = this.store.get<{ baseUrl: string } | null>(`plugin-provider:${plugin}:${kind}`, null);
    // A credential must never silently follow a base URL change.
    const clear = old?.baseUrl !== baseUrl;
    const saved = args.apiKey !== undefined || clear ? this.secrets.set(plugin, owner, `sdk.${kind}.key`, args.apiKey ?? null) : { persistent: true };
    this.store.set(`plugin-provider:${plugin}:${kind}`, { baseUrl });
    this.revisions.set(`${plugin}:${kind}`, revision + 1);
    return { configured: true, persistent: saved.persistent };
  }
  status(plugin: string, kind: 'ai' | 'services'): { configured: boolean; baseUrl?: string } {
    const config = this.store.get<{ baseUrl: string } | null>(`plugin-provider:${plugin}:${kind}`, null);
    return config ? { configured: true, baseUrl: config.baseUrl } : { configured: false };
  }
  async request(plugin: string, owner: number, kind: 'ai' | 'services', route: string, signal: AbortSignal, body?: unknown): Promise<Response> {
    const config = this.store.get<{ baseUrl: string } | null>(`plugin-provider:${plugin}:${kind}`, null);
    if (!config) throw new Error(t("{{v0}} provider 未配置", { v0: kind }));
    const key = this.secrets.get(plugin, owner, `sdk.${kind}.key`), encoded = body === undefined ? undefined : JSON.stringify(body);
    if (encoded && Buffer.byteLength(encoded) > 2 * 1024 * 1024) throw new Error(t("服务请求超过 2 MB"));
    const headers: Record<string, string> = { accept: 'application/json, text/event-stream', 'content-type': 'application/json' };
    if (key) headers.authorization = `Bearer ${key}`;
    return this.fetcher(providerUrl(config.baseUrl).href.replace(/\/$/, '') + route, { method: encoded === undefined ? 'GET' : 'POST', headers, body: encoded, signal, redirect: 'error', credentials: 'omit' });
  }
  clear(plugin: string): void {
    for (const kind of ['ai', 'services'] as const) {
      this.store.set(`plugin-provider:${plugin}:${kind}`, null);
      this.revisions.set(`${plugin}:${kind}`, this.revision(plugin, kind) + 1);
    }
  }
}
