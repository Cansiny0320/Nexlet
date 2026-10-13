import { object, string, type SdkContext } from './context';
import { PluginProviders, providerUrl, readJson } from './providers';
import type { PluginTasks } from './tasks';
export class PluginServices {
  constructor(private providers: PluginProviders, private tasks: PluginTasks) {}
  async invoke(context: SdkContext, method: string, value: unknown): Promise<unknown> {
    context.require('services');
    if (method === 'services.configure') return this.providers.configure(context.plugin, context.contents.id, 'services', value);
    if (method === 'services.status') return this.providers.status(context.plugin, 'services');
    const args = object(value), id = string(args.id, 100);
    return this.tasks.run(context.contents.id, id, Number(args.timeoutMs ?? 30000), async signal => {
      const request = async (route: string, body?: unknown) => readJson(await this.providers.request(context.plugin, context.contents.id, 'services', route, signal, body), signal);
      switch (method) {
        case 'services.account': { const result = await request('/account'); if (result.user !== null && (!result.user || typeof object(result.user).id !== 'string')) throw new Error('账号响应格式无效'); return result; }
        case 'services.login': { const result = await request('/auth/start', { pluginId: context.plugin }); const loginUrl = new URL(string(result.url)); const origin = new URL(loginUrl); origin.search = ''; origin.hash = ''; providerUrl(origin.href); string(result.sessionId); return result; }
        case 'services.loginStatus': {
          const result = await request('/auth/status', { sessionId: string(args.sessionId, 200) });
          if (!['pending', 'complete', 'expired'].includes(String(result.status))) throw new Error('登录状态无效');
          if (result.status === 'complete') { const status = this.providers.status(context.plugin, 'services'); const saved = this.providers.configure(context.plugin, context.contents.id, 'services', { baseUrl: status.baseUrl, apiKey: string(result.token, 16384) }); delete result.token; result.persistent = saved.persistent; }
          return result;
        }
        case 'services.license': { const result = await request('/license?product=' + encodeURIComponent(string(args.product, 200))); if (typeof result.active !== 'boolean') throw new Error('授权响应格式无效'); return result; }
        case 'services.checkout': { const result = await request('/checkout', { product: string(args.product, 200), idempotencyKey: string(args.idempotencyKey, 200) }); const checkout = new URL(string(result.url)); if (checkout.protocol !== 'https:' || checkout.username || checkout.password) throw new Error('checkout URL 必须为 HTTPS'); return result; }
        case 'services.syncGet': { const result = await request('/sync/' + encodeURIComponent(string(args.key, 200))); if (result.version !== null && typeof result.version !== 'string') throw new Error('同步版本格式无效'); return result; }
        case 'services.syncPut': {
          if (args.expectedVersion !== null && typeof args.expectedVersion !== 'string') throw new Error('必须指定 expectedVersion');
          const result = await request('/sync/' + encodeURIComponent(string(args.key, 200)), { expectedVersion: args.expectedVersion, value: args.value, idempotencyKey: string(args.idempotencyKey, 200) });
          if (typeof result.version !== 'string') throw new Error('同步版本格式无效'); return result;
        }
        default: throw new Error('不支持的服务 API');
      }
    });
  }
}
