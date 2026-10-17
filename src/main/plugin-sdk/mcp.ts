import { t } from '../../shared/i18n';
import { createServer, type Server } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { object, type SdkContext } from './context';
import type { PluginTools } from './tools';
interface McpServer {
  server: Server;
  owner: number;
  plugin: string;
  jobs: Map<string, AbortController>;
}
export class PluginMcp {
  private servers = new Map<number, McpServer>();
  constructor(private tools: PluginTools) {}
  async invoke(context: SdkContext, method: string): Promise<unknown> {
    context.require('mcp');
    context.require('tools');
    context.require('backend');
    if (method === 'mcp.stop') {
      this.closeSession(context.contents.id);
      return true;
    }
    if (method !== 'mcp.start') throw new Error(t('不支持的 MCP API'));
    if (this.servers.has(context.contents.id)) throw new Error(t('MCP 已启动，请先停止'));
    return this.start(context.contents.id, context.plugin);
  }
  async start(owner: number, plugin: string): Promise<{ url: string; token: string }> {
    const token = randomBytes(32).toString('hex'),
      expected = Buffer.from('Bearer ' + token),
      jobs = new Map<string, AbortController>();
    const server = createServer(async (req, res) => {
      const reply = (status: number, body?: unknown) => {
        if (res.destroyed) return;
        res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(body === undefined ? undefined : JSON.stringify(body));
      };
      const address = server.address(),
        host = typeof address === 'object' && address ? `127.0.0.1:${address.port}` : '';
      const credential = Buffer.from(req.headers.authorization ?? '');
      if (
        req.headers.host !== host ||
        req.headers.origin ||
        credential.length !== expected.length ||
        !timingSafeEqual(credential, expected)
      ) {
        reply(403);
        return;
      }
      if (req.url !== '/mcp') {
        reply(404);
        return;
      }
      if (req.method !== 'POST') {
        reply(405);
        return;
      }
      if (
        req.headers['mcp-protocol-version'] &&
        !['2025-03-26', '2025-06-18'].includes(String(req.headers['mcp-protocol-version']))
      ) {
        reply(400);
        return;
      }
      if (!req.headers['content-type']?.includes('application/json')) {
        reply(415);
        return;
      }
      let id: string | number | null = null;
      try {
        let length = 0;
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          length += chunk.length;
          if (length > 512 * 1024) {
            reply(413);
            return;
          }
          chunks.push(chunk);
        }
        const message = object(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        if (message.jsonrpc !== '2.0' || typeof message.method !== 'string')
          throw new Error('Invalid Request');
        if (
          message.id !== undefined &&
          typeof message.id !== 'string' &&
          typeof message.id !== 'number'
        )
          throw new Error('Invalid id');
        id = (message.id as string | number) ?? null;
        if (message.method === 'notifications/cancelled') {
          const params = object(message.params);
          jobs.get(JSON.stringify(params.requestId))?.abort(new Error(t('MCP 请求已取消')));
          reply(202);
          return;
        }
        if (id === null) {
          reply(202);
          return;
        }
        let result: unknown;
        switch (message.method) {
          case 'initialize':
            result = {
              protocolVersion: '2025-06-18',
              capabilities: { tools: { listChanged: false } },
              serverInfo: { name: `Nexlet ${plugin}`, version: '1.0.0' },
            };
            break;
          case 'ping':
            result = {};
            break;
          case 'tools/list':
            result = { tools: this.tools.list(plugin) };
            break;
          case 'tools/call': {
            const params = object(message.params),
              key = JSON.stringify(id);
            if (jobs.has(key) || jobs.size >= 16) throw new Error('Duplicate or too many requests');
            if (typeof params.name !== 'string') throw new Error('Invalid tool name');
            const controller = new AbortController();
            jobs.set(key, controller);
            const timer = setTimeout(() => controller.abort(new Error(t('MCP 工具超时'))), 120000);
            try {
              const value = await this.tools.call(
                plugin,
                params.name,
                params.arguments,
                controller.signal,
              );
              result = { content: [{ type: 'text', text: JSON.stringify(value) ?? 'null' }] };
            } catch (error) {
              result = {
                isError: true,
                content: [{ type: 'text', text: String((error as Error).message || error) }],
              };
            } finally {
              clearTimeout(timer);
              jobs.delete(key);
            }
            break;
          }
          default:
            reply(200, {
              jsonrpc: '2.0',
              id,
              error: { code: -32601, message: 'Method not found' },
            });
            return;
        }
        reply(200, { jsonrpc: '2.0', id, result });
      } catch (error) {
        reply(400, {
          jsonrpc: '2.0',
          id,
          error: { code: -32600, message: String((error as Error).message || error) },
        });
      }
    });
    server.requestTimeout = 15000;
    server.headersTimeout = 10000;
    const instance = { server, owner, plugin, jobs };
    this.servers.set(owner, instance);
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
    } catch (error) {
      this.servers.delete(owner);
      server.close();
      throw error;
    }
    if (this.servers.get(owner) !== instance) {
      server.closeAllConnections();
      server.close();
      throw new Error(t('MCP 启动已取消'));
    }
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error(t('MCP 监听失败'));
    return { url: `http://127.0.0.1:${address.port}/mcp`, token };
  }
  closeSession(owner: number): void {
    const instance = this.servers.get(owner);
    if (!instance) return;
    this.servers.delete(owner);
    for (const job of instance.jobs.values()) job.abort(new Error(t('MCP 已停止')));
    instance.server.closeAllConnections();
    instance.server.close();
  }
  stop(plugin: string): void {
    for (const [owner, server] of this.servers)
      if (server.plugin === plugin) this.closeSession(owner);
  }
  close(): void {
    for (const owner of this.servers.keys()) this.closeSession(owner);
  }
}
