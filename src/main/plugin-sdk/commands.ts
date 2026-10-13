import type { BrowserWindow } from 'electron';
import type { PluginManifest, PluginRecord } from '../../shared/types';
import { validateManifest } from '../../shared/plugin-validation';
import { object, string, type SdkContext } from './context';
export interface SearchResult { id: string; title: string; description?: string; }
export interface PluginSearchState { text: string; placeholder: string; visible: boolean; results: SearchResult[]; }
interface Store { get<T>(key: string, fallback: T): T; set(key: string, value: unknown): void; }
export class PluginCommands {
  private searches = new Map<number, { context: SdkContext; state: PluginSearchState }>();
  constructor(private store: Store, private changed: () => void, private redirect: (plugin: string, code: string, payload: string) => Promise<void>) {}
  features(record: PluginRecord): PluginManifest['features'] {
    const dynamic = this.store.get<PluginManifest['features']>('plugin-features:' + record.manifest.id, []);
    return [...record.manifest.features, ...dynamic.filter(f => !record.manifest.features.some(staticFeature => staticFeature.code === f.code))];
  }
  async invoke(context: SdkContext, method: string, value: unknown): Promise<unknown> {
    if (method === 'commands.list') return this.features(context.record);
    if (method === 'commands.set') {
      const args = object(value), features = Array.isArray(args.features) && !args.features.length ? [] : validateManifest({ ...context.record.manifest, features: args.features }).features;
      if (features.some(f => context.record.manifest.features.some(existing => existing.code === f.code))) throw new Error('动态功能不能覆盖 manifest 功能');
      this.store.set('plugin-features:' + context.plugin, features); this.changed(); return true;
    }
    if (method === 'commands.redirect') {
      const args = object(value), plugin = string(args.pluginId, 100), code = string(args.code, 40), payload = typeof args.payload === 'string' ? args.payload : '';
      if (payload.length > 500000) throw new Error('跳转文本过长');
      setImmediate(() => { void this.redirect(plugin, code, payload).catch(error => { context.owner.webContents.send('host-change', 'error:' + String(error.message || error)); }); }); return true;
    }
    if (method === 'search.set') {
      const args = object(value), previous = this.searches.get(context.owner.id)?.state;
      const state: PluginSearchState = { text: args.text === undefined ? previous?.text ?? '' : String(args.text).slice(0, 500000), placeholder: typeof args.placeholder === 'string' ? args.placeholder.slice(0, 200) : previous?.placeholder ?? '搜索…', visible: args.visible !== false, results: previous?.results ?? [] };
      this.searches.set(context.owner.id, { context, state }); context.owner.webContents.send('host-change', 'plugin-ui-changed'); return true;
    }
    if (method === 'search.results') {
      if (!Array.isArray(value) || value.length > 100) throw new Error('搜索结果超过 100 条');
      const results = value.map(item => { const row = object(item); return { id: string(row.id, 100), title: string(row.title, 300), description: typeof row.description === 'string' ? row.description.slice(0, 1000) : undefined }; });
      if (new Set(results.map(row => row.id)).size !== results.length) throw new Error('搜索结果 ID 重复');
      const previous = this.searches.get(context.owner.id)?.state ?? { text: '', placeholder: '搜索…', visible: true };
      this.searches.set(context.owner.id, { context, state: { ...previous, results } }); context.owner.webContents.send('host-change', 'plugin-ui-changed'); return true;
    }
    throw new Error('不支持的指令 API');
  }
  read(owner: BrowserWindow): PluginSearchState | null { return this.searches.get(owner.id)?.state ?? null; }
  move(from: BrowserWindow, to: BrowserWindow): void {
    const entry = this.searches.get(from.id); if (!entry) return;
    this.searches.delete(from.id); entry.context.owner = to; this.searches.set(to.id, entry);
    if (!from.isDestroyed()) from.webContents.send('host-change', 'plugin-ui-changed');
    if (!to.isDestroyed()) to.webContents.send('host-change', 'plugin-ui-changed');
  }
  input(owner: BrowserWindow, text: unknown, selected?: unknown): true {
    const search = this.searches.get(owner.id); if (!search || search.context.contents.isDestroyed()) throw new Error('插件搜索会话已结束');
    if (selected !== undefined) { const id = string(selected, 100); if (!search.state.results.some(row => row.id === id)) throw new Error('结果已失效'); search.context.emit('search.select', { id }); }
    else { if (typeof text !== 'string' || text.length > 500000) throw new Error('搜索文本无效'); search.state.text = text; search.context.emit('search.change', { text }); }
    return true;
  }
  closeSession(id: number): void { for (const [owner, entry] of this.searches) if (entry.context.contents.id === id) { this.searches.delete(owner); if (!entry.context.owner.isDestroyed()) entry.context.owner.webContents.send('host-change', 'plugin-ui-changed'); } }
  clear(plugin: string): void { this.store.set('plugin-features:' + plugin, []); }
}
