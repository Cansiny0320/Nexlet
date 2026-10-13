import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { consumeChatStream } from '../src/main/plugin-sdk/ai';
import { PluginProviders, readJson } from '../src/main/plugin-sdk/providers';
import { PluginMcp } from '../src/main/plugin-sdk/mcp';
import { runProcess } from '../src/main/plugin-sdk/process';
import type { PluginTools } from '../src/main/plugin-sdk/tools';

describe('AI stream parsing', () => {
  it('handles split Unicode/CRLF frames and fragmented tool arguments', async () => {
    const text = ['data: ' + JSON.stringify({ choices: [{ delta: { content: '中文', tool_calls: [{ index: 0, id: 'call', function: { name: 'sum', arguments: '{"x":' } }] } }] }), 'data: ' + JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '1}' } }] } }] }), 'data: [DONE]'].join('\r\n\r\n') + '\r\n\r\n';
    const bytes = new TextEncoder().encode(text), seen: unknown[] = [];
    const stream = new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } });
    const result = await consumeChatStream(new Response(stream), new AbortController().signal, chunk => seen.push(chunk));
    expect(result).toEqual({ content: '中文', toolCalls: [{ id: 'call', type: 'function', function: { name: 'sum', arguments: '{"x":1}' } }] }); expect(seen).toHaveLength(2);
  });
  it('rejects truncation, malformed chunks and HTTP failure', async () => {
    const signal = new AbortController().signal;
    await expect(consumeChatStream(new Response('data: {"choices":[]}\n\n'), signal, () => {})).rejects.toThrow(/中断/);
    await expect(consumeChatStream(new Response('data: {}\n\n'), signal, () => {})).rejects.toThrow(/格式/);
    await expect(consumeChatStream(new Response('', { status: 401 }), signal, () => {})).rejects.toThrow(/401/);
  });
});

describe('provider HTTP transport', () => {
  it('uses encrypted-key storage, keeps credentials plugin-scoped and clears them when changing origin', async () => {
    const data = new Map<string, unknown>(), secrets = new Map<string, string>();
    const seen: { auth?: string; body: string }[] = [];
    const server = createServer(async (req, res) => { let body = ''; for await (const chunk of req) body += chunk; seen.push({ auth: req.headers.authorization, body }); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: true })); });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number }, baseUrl = `http://127.0.0.1:${address.port}`;
    const provider = new PluginProviders({ get: <T>(k: string, fallback: T) => (data.get(k) ?? fallback) as T, set: (k, v) => { data.set(k, v); } }, { set: (plugin, _, name, value) => { if (value === null) secrets.delete(plugin + name); else secrets.set(plugin + name, String(value)); return { persistent: true }; }, get: (plugin, _, name) => secrets.get(plugin + name) ?? null }, fetch);
    try {
      await expect(provider.request('a', 1, 'ai', '/models', AbortSignal.timeout(1000))).rejects.toThrow(/未配置/);
      provider.configure('a', 1, 'ai', { baseUrl, apiKey: 'private' });
      expect(JSON.stringify([...data.values()])).not.toContain('private');
      expect(provider.status('b', 'ai').configured).toBe(false);
      await readJson(await provider.request('a', 1, 'ai', '/chat/completions', AbortSignal.timeout(1000), { model: 'fixture' }), AbortSignal.timeout(1000));
      expect(seen[0]).toEqual({ auth: 'Bearer private', body: '{"model":"fixture"}' });
      provider.configure('a', 1, 'ai', { baseUrl: baseUrl + '/v2' });
      await provider.request('a', 1, 'ai', '/models', AbortSignal.timeout(1000)); expect(seen[1].auth).toBeUndefined();
      expect(() => provider.configure('a', 1, 'ai', { baseUrl: 'http://example.com' })).toThrow(/HTTPS/);
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
  it('does not treat error or malformed JSON responses as success', async () => {
    await expect(readJson(new Response('{}', { status: 409 }), AbortSignal.timeout(1000))).rejects.toThrow(/409/);
    await expect(readJson(new Response('[]'), AbortSignal.timeout(1000))).rejects.toThrow(/无效 JSON/);
  });
});

describe('local MCP transport', () => {
  it('requires authentication and rejects browser origins; calls only this server plugin tools', async () => {
    const calls: unknown[] = [];
    const tools = { list: (plugin: string) => [{ name: plugin + '-echo', inputSchema: { type: 'object' } }], call: async (...args: unknown[]) => { calls.push(args.slice(0, 3)); return { done: true }; } } as unknown as PluginTools;
    const mcp = new PluginMcp(tools), config = await mcp.start(1, 'org.fixture');
    const invoke = (body: unknown, headers: Record<string, string> = {}) => fetch(config.url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${config.token}`, ...headers }, body: JSON.stringify(body) });
    try {
      expect((await invoke({}, { authorization: 'wrong' })).status).toBe(403);
      expect((await invoke({}, { origin: 'https://evil.example' })).status).toBe(403);
      const result = await (await invoke({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })).json(); expect(result.result.protocolVersion).toBe('2025-06-18');
      expect((await invoke({ jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202);
      const called = await (await invoke({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'echo', arguments: { n: 2 } } })).json();
      expect(called.result.content[0].text).toBe('{"done":true}'); expect(calls).toEqual([['org.fixture', 'echo', { n: 2 }]]);
    } finally { mcp.close(); }
  });
});

describe('process execution', () => {
  it('uses literal arguments without shell expansion and collects output', async () => {
    const result = await runProcess({ executable: process.execPath, args: ['-e', 'process.stdout.write(process.argv[1]);process.stderr.write("err")', '$(echo should-not-run)'] }, AbortSignal.timeout(1000));
    expect(result).toEqual({ code: 0, stdout: '$(echo should-not-run)', stderr: 'err' });
  });
  it('kills a running child on cancellation', async () => {
    const controller = new AbortController();
    const pending = runProcess({ executable: process.execPath, args: ['-e', 'console.log("ready");setInterval(()=>{},1000)'] }, controller.signal, () => controller.abort(new Error('fixture cancel')));
    await expect(pending).rejects.toThrow('fixture cancel');
  });
});
