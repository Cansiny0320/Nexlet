import { t } from '../../shared/i18n';
import type { PluginRecord } from '../../shared/types';
import type { Schedule } from '../../shared/plugin-api';
import type { Store } from '../store';
import { PluginDatabase, type DocumentWrite } from './database';
import { PluginTasks } from './tasks';
import { PluginBackends } from './backend';
import { PluginScheduler } from './scheduler';
import { PluginSystem } from './system';
import { PluginScreen } from './screen';
import { PluginInput } from './input';
import type { Platform } from '../platform';
import { PluginBrowsers } from './browser';
import { PluginMedia } from './media';
import { PluginProviders } from './providers';
import { PluginAI } from './ai';
import { PluginServices } from './services';
import { PluginTools } from './tools';
import { PluginMcp } from './mcp';
import type { PluginSecrets } from '../plugin-secrets';
import { net } from 'electron';
import { PluginWindows, type WindowHooks } from './windows';
import { PluginCommands } from './commands';

import { object, string, type SdkCaller, type SdkContext } from './context';
export class PluginSdk {
  readonly tasks = new PluginTasks();
  private owners = new Map<number, object>();
  readonly database: PluginDatabase;
  readonly backends: PluginBackends;
  readonly scheduler: PluginScheduler;
  readonly screen = new PluginScreen(this.tasks);
  readonly input = new PluginInput();
  readonly browsers = new PluginBrowsers(this.tasks);
  readonly media = new PluginMedia(this.tasks);
  readonly tools: PluginTools;
  readonly mcp: PluginMcp;
  readonly providers?: PluginProviders;
  private ai?: PluginAI;
  private services?: PluginServices;
  private system?: PluginSystem;
  windows?: PluginWindows;
  commands?: PluginCommands;
  configureUi(
    windows: WindowHooks,
    changed: () => void,
    redirect: (plugin: string, code: string, payload: string) => Promise<void>,
  ): void {
    this.windows = new PluginWindows(windows);
    this.commands = new PluginCommands(this.store, changed, redirect);
  }
  constructor(
    private store: Store,
    records: () => PluginRecord[],
    platform?: Platform,
    secrets?: PluginSecrets,
  ) {
    if (platform) this.system = new PluginSystem(this.tasks, platform);
    this.database = new PluginDatabase(store.db);
    this.backends = new PluginBackends(store.directory);
    this.tools = new PluginTools(this.backends, records, this.tasks);
    this.mcp = new PluginMcp(this.tools);
    if (secrets) {
      this.providers = new PluginProviders(store, secrets, (url, init) => net.fetch(url, init));
      this.ai = new PluginAI(this.providers, this.tasks);
      this.services = new PluginServices(this.providers, this.tasks);
    }
    this.scheduler = new PluginScheduler(
      store,
      (id) =>
        records().some(
          (record) =>
            record.manifest.id === id &&
            record.enabled &&
            !!record.manifest.backend &&
            record.manifest.permissions.includes('backend'),
        ),
      async (id, schedule, signal) => {
        const record = records().find((record) => record.manifest.id === id && record.enabled);
        if (!record) throw new Error(t('插件已停用'));
        return this.backends.call(record, schedule.method, schedule.args, signal, () => {});
      },
    );
  }
  async invoke(caller: SdkCaller, method: unknown, value: unknown): Promise<unknown> {
    if (typeof method !== 'string') throw new Error(t('API 方法无效'));
    let token = this.owners.get(caller.contents.id);
    if (!token) {
      token = {};
      this.owners.set(caller.contents.id, token);
    }
    const plugin = caller.record.manifest.id;
    const context: SdkContext = {
      ...caller,
      plugin,
      require: (permission) => {
        if (!caller.record.manifest.permissions.includes(permission))
          throw new Error(t('未授权：{{v0}}', { v0: permission }));
      },
      emit: (event, value) => {
        if (this.owners.get(caller.contents.id) === token && !caller.contents.isDestroyed())
          caller.contents.send('plugin-sdk-event', { event, value });
      },
    };
    if (method === 'tasks.cancel') return this.tasks.cancel(caller.contents.id, value);
    if (method.startsWith('window.')) {
      if (!this.windows) throw new Error(t('窗口集成未配置'));
      return this.windows.invoke(context, method, value);
    }
    if (method.startsWith('commands.') || method.startsWith('search.')) {
      if (!this.commands) throw new Error(t('指令集成未配置'));
      return this.commands.invoke(
        { ...context, owner: context.hostOwner ?? context.owner },
        method,
        value,
      );
    }
    if (method.startsWith('screen.')) return this.screen.invoke(context, method, value);
    if (method.startsWith('browser.')) return this.browsers.invoke(context, method, value);
    if (method.startsWith('media.')) return this.media.invoke(context, method, value);
    if (method.startsWith('tools.')) return this.tools.invoke(context, method, value);
    if (method.startsWith('mcp.')) return this.mcp.invoke(context, method);
    if (method.startsWith('ai.')) {
      if (!this.ai) throw new Error(t('AI 集成未配置'));
      return this.ai.invoke(context, method, value);
    }
    if (method.startsWith('services.')) {
      if (!this.services) throw new Error(t('服务集成未配置'));
      return this.services.invoke(context, method, value);
    }
    if (method === 'input.key' || method === 'input.mouse')
      return this.input.invoke(context, method, value);
    if (
      ['system.', 'files.', 'process.', 'dialogs.', 'notifications.', 'clipboard.', 'input.'].some(
        (prefix) => method.startsWith(prefix),
      )
    ) {
      if (!this.system) throw new Error(t('系统集成未配置'));
      return this.system.invoke(context, method, value);
    }
    if (method === 'storage.keys') return Object.keys(this.store.get('plugin-data:' + plugin, {}));
    if (method === 'storage.remove') {
      const data = this.store.get<Record<string, unknown>>('plugin-data:' + plugin, {}),
        key = string(value, 100);
      const had = Object.hasOwn(data, key);
      delete data[key];
      this.store.set('plugin-data:' + plugin, data);
      return had;
    }
    if (method.startsWith('database.')) {
      const args = object(value ?? {}),
        id = () => string(args.id, 240),
        rev = () => string(args.rev, 100);
      switch (method) {
        case 'database.get':
          return this.database.get(plugin, id());
        case 'database.put':
          return this.database.put(plugin, args as unknown as DocumentWrite);
        case 'database.bulk':
          return this.database.bulk(plugin, args.documents as DocumentWrite[]);
        case 'database.query':
          return this.database.query(plugin, args);
        case 'database.remove':
          return this.database.remove(plugin, id(), rev());
        case 'database.getAttachment':
          return this.database.getAttachment(plugin, id(), string(args.name, 240));
        case 'database.putAttachment':
          return this.database.putAttachment(
            plugin,
            id(),
            rev(),
            string(args.name, 240),
            string(args.mime, 200),
            args.data as Uint8Array,
          );
        case 'database.removeAttachment':
          return this.database.removeAttachment(plugin, id(), rev(), string(args.name, 240));
      }
    }
    if (method.startsWith('backend.') || method.startsWith('schedules.')) {
      context.require('backend');
      if (!caller.record.manifest.backend) throw new Error(t('插件未声明 backend 入口'));
      switch (method) {
        case 'backend.call': {
          const args = object(value),
            id = string(args.id, 100);
          return this.tasks.run(caller.contents.id, id, Number(args.timeoutMs ?? 30000), (signal) =>
            this.backends.call(
              caller.record,
              string(args.method, 100),
              args.args,
              signal,
              (value) => context.emit('progress', { id, value }),
            ),
          );
        }
        case 'backend.stop':
          this.backends.stop(plugin);
          return true;
        case 'schedules.list':
          return this.scheduler.list(plugin);
        case 'schedules.set':
          return this.scheduler.set(plugin, object(value) as unknown as Schedule);
        case 'schedules.remove':
          return this.scheduler.remove(plugin, string(value, 100));
      }
    }
    throw new Error(t('不支持的插件 API'));
  }
  closeSession(id: number): void {
    this.owners.delete(id);
    this.tasks.close(id);
    this.system?.closeSession(id);
    this.windows?.closeSession(id);
    this.commands?.closeSession(id);
    this.browsers.closeSession(id);
    this.mcp.closeSession(id);
  }
  stop(plugin: string): void {
    this.scheduler.stop(plugin);
    this.backends.stop(plugin);
    this.windows?.stop(plugin);
    this.browsers.stop(plugin);
    this.mcp.stop(plugin);
    this.tools.stop(plugin);
  }
  async clear(plugin: string): Promise<void> {
    this.stop(plugin);
    this.scheduler.clear(plugin);
    this.database.clear(plugin);
    this.commands?.clear(plugin);
    this.providers?.clear(plugin);
    await this.browsers.clear(plugin);
  }
  close(): void {
    this.owners.clear();
    this.system?.close();
    this.tasks.closeAll();
    this.scheduler.close();
    this.backends.close();
    this.windows?.close();
    this.browsers.close();
    this.mcp.close();
  }
}
