import { t } from '../shared/i18n';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { defaultCommandConfig, DEFAULT_PINNED } from '../shared/command-config';
import { defaultProductivity, validateSnippet } from '../shared/productivity';
import { validateWebShortcut } from '../shared/web-shortcuts';
import type { AIConfiguration, AIProvider } from '../shared/ai';
import type { ClipItem, PluginRecord, Scratchpad } from '../shared/types';
import type { SyncCategory, SyncEntity, SyncRecord } from '../shared/account-sync';
import type { Store } from './store';
import type { AIModels } from './ai-models';
import type { SyncAdapter } from './sync-engine';
import { validateProfile } from './config-profile';

const settingsKeys = [
  'theme',
  'language',
  'hideOnBlur',
  'autoCheckUpdates',
  'restoreToolSessions',
] as const;
const safeId = (id: string) =>
  /^[a-zA-Z0-9_:.-]{1,250}$/.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id);
const fields = (value: Record<string, unknown>, names: string[]) =>
  Object.fromEntries(names.filter((k) => value[k] !== undefined).map((k) => [k, value[k]]));
export class StoreSyncAdapter implements SyncAdapter {
  constructor(
    private store: Store,
    private models: AIModels,
    private plugins: () => PluginRecord[],
  ) {}
  transaction(write: () => void) {
    this.store.db.exec('BEGIN IMMEDIATE');
    try {
      write();
      this.store.db.exec('COMMIT');
    } catch (error) {
      this.store.db.exec('ROLLBACK');
      throw error;
    }
  }
  snapshot(categories: SyncCategory[]): SyncEntity[] {
    const result: SyncEntity[] = [];
    const add = (kind: SyncCategory, id: string, value: unknown) => {
      if (categories.includes(kind)) result.push({ kind, id, value });
    };
    const settings = this.store.settings(),
      config = this.store.get('command-config', defaultCommandConfig());
    for (const key of settingsKeys) add('settings', key, settings[key]);
    const pending = this.store.get<Record<string, unknown>>('sync-device-mappings', {});
    for (const id of new Set([
      ...Object.keys(config.commands),
      ...config.localEntries.map((e) => 'local:' + e.id),
      ...Object.keys(pending),
    ])) {
      add(
        'commands',
        id,
        pending[id] ?? {
          preference: config.commands[id] ?? {},
          entry: config.localEntries.find((e) => 'local:' + e.id === id) ?? null,
          platform: process.platform,
        },
      );
    }
    add('pinned', 'default', config.pinned ?? this.store.get('pinned', DEFAULT_PINNED));
    for (const entry of settings.webShortcuts)
      add(entry.type === 'search' ? 'webShortcuts' : 'bookmarks', entry.id, entry);
    for (const entry of this.store.get('productivity', defaultProductivity()).snippets)
      add('snippets', entry.id, entry);
    const actions =
      this.store.get<{ actions?: Record<string, unknown>[] }>(
        'plugin-data:org.nexlet.ai-actions',
        {},
      ).actions ?? [];
    for (const entry of actions)
      add(
        'aiActions',
        String(entry.id),
        fields(entry, ['id', 'name', 'prompt', 'model', 'baseUrl']),
      );
    const ai = this.models.state();
    for (const provider of ai.providers) add('aiModels', provider.id, provider);
    add('aiModels', 'default', ai.defaultModel);
    for (const pad of this.store.get<Scratchpad[]>('pads', [])) add('pads', pad.id, pad);
    const note = this.store.get<{ note?: string }>('plugin-data:org.nexlet.hello', {}).note;
    if (typeof note === 'string') add('notes', 'default', note);
    let deviceId = this.store.get('sync-device-id', '');
    if (!deviceId) {
      deviceId = randomUUID();
      this.store.set('sync-device-id', deviceId);
    }
    const manifests = this.store.get<Record<string, unknown>>('sync-plugin-manifests', {});
    for (const [id, value] of Object.entries(manifests))
      if (id !== deviceId) add('plugins', id, value);
    add(
      'plugins',
      deviceId,
      this.plugins().map((p) => ({
        id: p.manifest.id,
        version: p.manifest.version,
        enabled: p.enabled,
      })),
    );
    if (categories.some((c) => c.startsWith('clipboard'))) {
      for (const clip of this.store.clips()) {
        const kind: SyncCategory =
          clip.kind === 'image'
            ? 'clipboardImages'
            : clip.favorite
              ? 'clipboardFavorites'
              : 'clipboardHistory';
        if (!categories.includes(kind)) continue;
        const value: Record<string, unknown> = fields(clip as unknown as Record<string, unknown>, [
          'kind',
          'text',
          'createdAt',
          'favorite',
        ]);
        if (clip.kind === 'files') {
          const files = clip.files?.length ? clip.files : clip.text.split(/\r?\n/).filter(Boolean);
          value.files = files.map((file) => path.win32.basename(file));
          value.text = (value.files as string[]).join('\n');
        }
        if (clip.kind === 'image') {
          if (
            !clip.imagePath ||
            path.dirname(path.resolve(clip.imagePath)) !== path.resolve(this.store.images) ||
            !existsSync(clip.imagePath)
          )
            continue;
          if (statSync(clip.imagePath).size > 5 * 1024 * 1024)
            throw new Error(t('同步图片单张不能超过 5 MiB'));
          const bytes = readFileSync(clip.imagePath);
          value.image = bytes.toString('base64');
          value.width = clip.width;
          value.height = clip.height;
        }
        add(kind, clip.id, value);
      }
    }
    return result;
  }
  apply(record: SyncRecord) {
    if (!safeId(record.id) || record.schema !== 1) throw new Error(t('同步数据格式无效'));
    const { kind, id, value, deleted } = record,
      raw = value as Record<string, any>;
    if (
      !deleted &&
      value !== null &&
      typeof value === 'object' &&
      Array.isArray(value) &&
      !['plugins', 'pinned'].includes(kind)
    )
      throw new Error(t('同步数据格式无效'));
    if (kind === 'settings') {
      if (!settingsKeys.includes(id as (typeof settingsKeys)[number]))
        throw new Error(t('同步设置不受支持'));
      if (deleted) return;
      const valid = validateProfile({ version: 1, categories: { settings: { [id]: value } } })
        .categories.settings!;
      this.store.set('settings', { ...this.store.settings(), ...valid });
    } else if (kind === 'commands') {
      const config = this.store.get('command-config', defaultCommandConfig()),
        pending = this.store.get<Record<string, unknown>>('sync-device-mappings', {});
      if (deleted) {
        delete config.commands[id];
        delete pending[id];
      } else {
        const valid = validateProfile({
          version: 1,
          categories: {
            commands: {
              version: 1,
              commands: { [id]: raw.preference },
              localEntries: raw.entry ? [raw.entry] : [],
              layout: 'grid',
            },
          },
        }).categories.commands!;
        const incoming = valid.commands[id],
          old = config.commands[id] ?? {};
        config.commands[id] = { ...old, aliases: incoming.aliases, disabled: incoming.disabled };
        if (incoming.shortcut !== old.shortcut || raw.entry)
          pending[id] = {
            preference: incoming,
            entry: valid.localEntries[0] ?? null,
            platform: raw.platform,
          };
        else delete pending[id];
      }
      config.revision++;
      this.store.set('command-config', config);
      this.store.set('sync-device-mappings', pending);
    } else if (kind === 'pinned') {
      if (deleted) return;
      const pinned = validateProfile({ version: 1, categories: { pinned: value } }).categories
        .pinned;
      const config = this.store.get('command-config', defaultCommandConfig());
      this.store.set('command-config', { ...config, pinned, revision: config.revision + 1 });
    } else if (kind === 'webShortcuts' || kind === 'bookmarks') {
      const settings = this.store.settings(),
        entries = settings.webShortcuts.filter((e) => e.id !== id);
      if (!deleted) entries.push(validateWebShortcut({ ...raw, id }));
      if (entries.length > 100) throw new Error(t('网页入口超过 100 项'));
      this.store.set('settings', { ...settings, webShortcuts: entries });
    } else if (kind === 'snippets') {
      const config = this.store.get('productivity', defaultProductivity()),
        snippets = config.snippets.filter((s) => s.id !== id);
      if (!deleted) snippets.push(validateSnippet({ ...raw, id }));
      if (snippets.length > 500) throw new Error(t('快捷短语超过 500 项'));
      this.store.set('productivity', { ...config, snippets, revision: config.revision + 1 });
    } else if (kind === 'aiActions') {
      const config = this.store.get<{ actions?: unknown[] }>(
        'plugin-data:org.nexlet.ai-actions',
        {},
      );
      const actions = (config.actions ?? []).filter((a) => (a as { id: string }).id !== id);
      if (!deleted)
        actions.push(
          validateProfile({ version: 1, categories: { aiActions: [{ ...raw, id }] } }).categories
            .aiActions![0],
        );
      if (actions.length > 100) throw new Error(t('AI 动作超过 100 项'));
      this.store.set('plugin-data:org.nexlet.ai-actions', { ...config, actions });
    } else if (kind === 'aiModels') {
      if (id === 'default') {
        if (
          value !== null &&
          !deleted &&
          (typeof raw?.providerId !== 'string' ||
            typeof raw.model !== 'string' ||
            raw.providerId.length > 64 ||
            raw.model.length > 200)
        )
          throw new Error(t('默认模型无效'));
        const config = this.store.get<AIConfiguration>('ai-models:v1', {
          providers: [],
          defaultModel: null,
        });
        this.store.set('ai-models:v1', { ...config, defaultModel: deleted ? null : value });
      } else if (deleted) {
        if (this.models.state().providers.some((p) => p.id === id)) this.models.remove(id);
      } else this.models.save({ ...raw, id } as AIProvider);
    } else if (kind === 'notes') {
      if (id !== 'default' || (!deleted && (typeof value !== 'string' || value.length > 250000)))
        throw new Error(t('便笺内容无效或过大'));
      const data = this.store.get<Record<string, unknown>>('plugin-data:org.nexlet.hello', {});
      if (deleted) delete data.note;
      else data.note = value;
      this.store.set('plugin-data:org.nexlet.hello', data);
    } else if (kind === 'pads') {
      const pads = this.store.get<Scratchpad[]>('pads', []).filter((p) => p.id !== id);
      if (!deleted) {
        if (
          !raw ||
          typeof raw.name !== 'string' ||
          raw.name.length > 100 ||
          typeof raw.locked !== 'boolean' ||
          !/^#[a-fA-F0-9]{6}$/.test(raw.color) ||
          !Array.isArray(raw.lines) ||
          raw.lines.length > 1000 ||
          ![raw.createdAt, raw.updatedAt].every(Number.isSafeInteger) ||
          raw.lines.some(
            (l: any) =>
              typeof l.id !== 'string' ||
              l.id.length > 80 ||
              typeof l.expression !== 'string' ||
              l.expression.length > 512 ||
              typeof l.note !== 'string' ||
              l.note.length > 1000,
          )
        )
          throw new Error(t('同步稿纸格式无效'));
        pads.push({
          ...fields(raw, ['name', 'locked', 'color', 'lines', 'createdAt', 'updatedAt']),
          id,
        } as unknown as Scratchpad);
      }
      if (pads.length > 500) throw new Error(t('稿纸超过 500 份'));
      this.store.set('pads', pads);
    } else if (kind === 'plugins') {
      const manifests = this.store.get<Record<string, unknown>>('sync-plugin-manifests', {});
      if (deleted) delete manifests[id];
      else
        manifests[id] = validateProfile({
          version: 1,
          categories: { plugins: value },
        }).categories.plugins;
      this.store.set('sync-plugin-manifests', manifests);
    } else if (kind.startsWith('clipboard')) {
      if (deleted) {
        const current = this.store.clip(id),
          category =
            current?.kind === 'image'
              ? 'clipboardImages'
              : current?.favorite
                ? 'clipboardFavorites'
                : 'clipboardHistory';
        if (category === kind) this.store.db.prepare('DELETE FROM clips WHERE id=?').run(id);
        return;
      }
      if (
        !raw ||
        !['text', 'image', 'files'].includes(raw.kind) ||
        typeof raw.text !== 'string' ||
        raw.text.length > 500000 ||
        typeof raw.favorite !== 'boolean' ||
        !Number.isSafeInteger(raw.createdAt)
      )
        throw new Error(t('同步剪贴板格式无效'));
      let imagePath: string | undefined;
      let hash: string;
      if (raw.kind === 'image') {
        if (
          typeof raw.image !== 'string' ||
          raw.image.length > 7 * 1024 * 1024 ||
          !/^[A-Za-z0-9+/]*={0,2}$/.test(raw.image) ||
          ![raw.width, raw.height].every((v) => Number.isInteger(v) && v > 0 && v <= 32768) ||
          raw.width * raw.height > 36000000
        )
          throw new Error(t('同步图片格式无效'));
        const bytes = Buffer.from(raw.image, 'base64');
        if (
          bytes.length < 24 ||
          !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
          bytes.readUInt32BE(16) !== raw.width ||
          bytes.readUInt32BE(20) !== raw.height
        )
          throw new Error(t('同步图片必须是 PNG'));
        hash = createHash('sha256').update(bytes).digest('hex');
        imagePath = path.join(this.store.images, hash + '.png');
        if (!existsSync(imagePath)) writeFileSync(imagePath, bytes, { flag: 'wx' });
      } else
        hash = createHash('sha256')
          .update('sync:' + id)
          .digest('hex');
      let text = raw.text;
      if (raw.kind === 'files') {
        if (
          !Array.isArray(raw.files) ||
          raw.files.length > 1000 ||
          raw.files.some(
            (v: unknown) => typeof v !== 'string' || v.length > 255 || /[\\/\0]/.test(v),
          )
        )
          throw new Error(t('文件元数据无效'));
        text = raw.files.join('\n');
      }
      const clip: ClipItem = {
        id,
        kind: raw.kind,
        text,
        hash,
        createdAt: raw.createdAt,
        favorite: raw.favorite,
        ...(raw.kind === 'files' ? { files: [] } : {}),
        ...(imagePath ? { imagePath, width: raw.width, height: raw.height } : {}),
      };
      const duplicate = this.store.db
        .prepare('SELECT id FROM clips WHERE hash=? AND id<>?')
        .get(hash, id);
      if (duplicate)
        clip.hash = createHash('sha256')
          .update(hash + ':' + id)
          .digest('hex');
      this.store.db
        .prepare(
          'INSERT INTO clips(id,hash,created,favorite,data) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET hash=excluded.hash,created=excluded.created,favorite=excluded.favorite,data=excluded.data',
        )
        .run(id, clip.hash, clip.createdAt, Number(clip.favorite), JSON.stringify(clip));
    }
  }
}
