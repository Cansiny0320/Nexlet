import Ajv, { type ValidateFunction } from 'ajv';
import type { PluginRecord } from '../../shared/types';
import { object, string, type SdkContext } from './context';
import type { PluginBackends } from './backend';
import type { PluginTasks } from './tasks';
export interface ToolDefinition { name: string; description: string; inputSchema: Record<string, unknown>; method: string; }
interface Tool { definition: ToolDefinition; validate: ValidateFunction; }
export class PluginTools {
  private registrations = new Map<string, Map<string, Tool>>();
  private ajv = new Ajv({ strict: false, allErrors: false, validateFormats: false });
  constructor(private backends: PluginBackends, private records: () => PluginRecord[], private tasks: PluginTasks) {}
  list(plugin: string): Omit<ToolDefinition, 'method'>[] { return [...this.registrations.get(plugin)?.values() ?? []].map(({ definition: { method: _, ...definition } }) => definition); }
  register(plugin: string, value: unknown): true {
    const args = object(value), name = string(args.name, 64), method = string(args.method, 100), description = string(args.description, 2000), inputSchema = object(args.inputSchema);
    if (!/^[a-zA-Z][\w.-]*$/.test(name) || inputSchema.type !== 'object' || JSON.stringify(inputSchema).length > 32768) throw new Error('工具名称或输入 schema 无效');
    // No remote schema resolution; all references must be local to this schema.
    if (/"\$ref"\s*:\s*"(?!#)/.test(JSON.stringify(inputSchema))) throw new Error('工具 schema 仅支持本地引用');
    const validate = this.ajv.compile(inputSchema);
    let tools = this.registrations.get(plugin); if (!tools) { tools = new Map(); this.registrations.set(plugin, tools); }
    if (tools.size >= 100 && !tools.has(name)) throw new Error('工具数量超过 100');
    tools.set(name, { definition: { name, description, inputSchema, method }, validate }); return true;
  }
  async call(plugin: string, name: string, args: unknown, signal: AbortSignal, progress: (value: unknown) => void = () => {}): Promise<unknown> {
    const tool = this.registrations.get(plugin)?.get(name), record = this.records().find(r => r.manifest.id === plugin && r.enabled);
    if (!tool || !record || !record.manifest.permissions.includes('tools') || !record.manifest.permissions.includes('backend')) throw new Error('工具不存在或插件已停用');
    if (!tool.validate(args ?? {})) throw new Error('工具输入不符合 schema');
    return this.backends.call(record, tool.definition.method, args ?? {}, signal, progress);
  }
  async invoke(context: SdkContext, method: string, value: unknown): Promise<unknown> {
    context.require('tools'); context.require('backend');
    if (!context.record.manifest.backend) throw new Error('工具需要 backend 入口');
    if (method === 'tools.list') return this.list(context.plugin);
    if (method === 'tools.register') return this.register(context.plugin, value);
    if (method === 'tools.remove') return this.registrations.get(context.plugin)?.delete(string(value, 64)) ?? false;
    if (method === 'tools.call') {
      const args = object(value), id = string(args.id, 100);
      return this.tasks.run(context.contents.id, id, Number(args.timeoutMs ?? 30000), signal => this.call(context.plugin, string(args.name, 64), args.args, signal, value => context.emit('progress', { id, value })));
    }
    throw new Error('不支持的工具 API');
  }
  stop(plugin: string): void { this.registrations.delete(plugin); }
}
