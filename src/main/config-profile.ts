import { createHash, randomUUID } from 'node:crypto';
import { parse, type ParseError } from 'jsonc-parser';
import Ajv from 'ajv';
import { t } from '../shared/i18n';
import { type PluginRecord, type Settings } from '../shared/types';
import { defaultCommandConfig, DEFAULT_PINNED } from '../shared/command-config';
import { defaultProductivity, validateProductivity } from '../shared/productivity';
import { validateWebShortcut } from '../shared/web-shortcuts';
import { panelCommands } from '../shared/super-panel';
import type {
  ConfigProfile,
  ProfileCategories,
  ProfileCategory,
  ProfilePreview,
} from '../shared/config-profile';
import type { Store } from './store';
import { PanelConfigStore } from './panel-config';
const str = (maxLength = 32767) => ({ type: 'string', maxLength, pattern: '^[^\\u0000]*$' });
const bool = { type: 'boolean' },
  integer = (minimum: number, maximum: number) => ({ type: 'integer', minimum, maximum });
const list = (items: object, maxItems: number) => ({ type: 'array', items, maxItems });
const obj = (properties: Record<string, object>, required = Object.keys(properties)) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const line = (maxLength = 32767) => ({ ...str(maxLength), pattern: '^[^\\u0000\\r\\n]*$' });
const label = (maxLength: number) => ({
  ...line(maxLength),
  minLength: 1,
  allOf: [{ pattern: '\\S' }],
});
const id = { ...label(250), not: { enum: ['__proto__', 'constructor', 'prototype'] } };
const panelCommand = obj({ kind: { const: 'command' }, id, commandId: id });
const settingsSchema = obj(
  {
    language: { enum: ['system', 'zh-CN', 'zh-Hant', 'en'] },
    shortcut: str(80),
    theme: { enum: ['system', 'dark', 'light'] },
    hideOnBlur: bool,
    autoCheckUpdates: bool,
    clipboardEnabled: bool,
    restoreToolSessions: bool,
    clipboardExcludedApps: list(str(), 100),
    clipboardOcrFavorites: bool,
    maxClipboardItems: integer(1, 5000),
    retentionDays: integer(1, 3650),
    searchPaths: list(str(), 20),
    fileSearchPaths: list(str(), 26),
  },
  [],
);
const schemas = {
  settings: settingsSchema,
  commands: obj({
    version: { const: 1 },
    commands: {
      type: 'object',
      maxProperties: 1000,
      propertyNames: id,
      additionalProperties: obj(
        { aliases: list(line(60), 20), shortcut: line(80), disabled: bool, captureSelection: bool },
        [],
      ),
    },
    localEntries: list(obj({ id, name: label(60), path: str() }), 200),
    layout: { enum: ['grid', 'list'] },
  }),
  pinned: list(id, 1000),
  webShortcuts: list(
    obj({ id, name: str(60), url: str(4096), type: { enum: ['fixed', 'search'] } }, [
      'id',
      'name',
      'url',
    ]),
    100,
  ),
  panel: obj({
    version: { const: 1 },
    enabled: bool,
    mouse: { enum: ['right', 'middle', 'off'] },
    holdMs: integer(200, 400),
    shortcut: str(80),
    excludedApps: list(label(32767), 100),
    items: list(
      {
        anyOf: [
          panelCommand,
          obj({
            kind: { const: 'folder' },
            id,
            name: label(40),
            children: list(panelCommand, 200),
          }),
        ],
      },
      200,
    ),
  }),
  snippets: list(obj({ id, name: str(80), group: str(60), body: str(50000) }), 500),
  workspaces: list(
    obj({
      id,
      name: str(80),
      items: list(
        obj(
          {
            id,
            kind: { enum: ['app', 'folder', 'editor', 'terminal', 'url'] },
            target: str(),
            program: str(),
            args: list(str(4096), 30),
          },
          ['id', 'kind', 'target'],
        ),
        50,
      ),
    }),
    100,
  ),
  aiActions: list(
    obj({
      id: { ...str(100), pattern: '^[a-zA-Z0-9_-]+$' },
      name: { ...str(80), pattern: '\\S' },
      prompt: { ...str(20000), pattern: '\\S' },
      model: str(200),
      baseUrl: str(2048),
    }),
    100,
  ),
  plugins: list(obj({ id, version: str(80), enabled: bool }), 1000),
};
const validate = new Ajv({ allErrors: false }).compile(
  obj(
    {
      version: { const: 1 },
      platform: { enum: ['darwin', 'win32', 'linux'] },
      categories: obj(schemas, []),
    },
    ['version', 'categories'],
  ),
);
const categories = Object.keys(schemas) as ProfileCategory[];
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const plain = (value: unknown) => JSON.stringify(value, null, 2);
function unique(items: { id: string }[]) {
  if (new Set(items.map((item) => item.id)).size !== items.length) throw Error(t('配置 ID 重复'));
}
export function validateProfile(value: unknown): ConfigProfile {
  if (!validate(value))
    throw Error(
      t('配置格式无效') +
        ': ' +
        (validate.errors?.[0]?.instancePath || '/') +
        ' ' +
        validate.errors?.[0]?.message,
    );
  const profile = value as unknown as ConfigProfile,
    data = profile.categories;
  const product = validateProductivity({
    ...defaultProductivity(),
    snippets: data.snippets ?? [],
    workspaces: data.workspaces ?? [],
  });
  if (data.snippets) data.snippets = product.snippets;
  if (data.workspaces) data.workspaces = product.workspaces;
  for (const items of [
    data.webShortcuts,
    data.aiActions,
    data.plugins,
    data.commands?.localEntries,
  ])
    if (items) unique(items);
  if (data.pinned && new Set(data.pinned).size !== data.pinned.length)
    throw Error(t('固定项列表无效'));
  if (data.webShortcuts) data.webShortcuts = data.webShortcuts.map(validateWebShortcut);
  for (const item of data.aiActions || []) {
    const url = new URL(item.baseUrl);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
      throw Error(t('链接无效'));
    if (
      url.search ||
      url.hash ||
      (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    )
      throw Error(t('链接无效'));
    item.name = item.name.trim();
    item.model = item.model.trim();
    item.baseUrl = url.href.replace(/\/$/, '');
  }
  for (const target of [
    ...(data.settings?.searchPaths || []),
    ...(data.settings?.fileSearchPaths || []),
    ...(data.commands?.localEntries.map((item) => item.path) || []),
  ])
    if (!/^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(target) || /[\r\n]/.test(target))
      throw Error(t('请输入绝对路径'));
  if (data.panel) {
    unique(
      data.panel.items.flatMap((item) =>
        item.kind === 'folder' ? [item, ...item.children] : [item],
      ),
    );
    const commands = panelCommands(data.panel.items);
    if (commands.length > 200) throw Error(t('面板最多保存 200 项'));
    unique(commands.map((item) => ({ id: item.commandId })));
  }
  return profile;
}
export type ProfileWrite = (next: ProfileCategories, write: () => void) => void;
export class ConfigProfiles {
  private pending: { token: string; hash: string; profile: ConfigProfile } | null = null;
  constructor(
    private store: Store,
    private plugins: () => PluginRecord[],
  ) {}
  snapshot(): ProfileCategories {
    const raw = this.store.settings();
    const settings = Object.fromEntries(
      Object.keys(settingsSchema.properties).map((key) => [key, raw[key as keyof Settings]]),
    ) as ProfileCategories['settings'];
    const {
      revision: _,
      pinned,
      ...commands
    } = this.store.get('command-config', defaultCommandConfig());
    const { revision: __, ...panel } = new PanelConfigStore(
      this.store,
      () => pinned ?? this.store.get('pinned', DEFAULT_PINNED),
    ).read();
    const product = this.store.get('productivity', defaultProductivity());
    const actions =
      this.store.get<{ actions?: unknown[] }>('plugin-data:org.nexlet.ai-actions', {}).actions ||
      [];
    return {
      settings,
      commands,
      pinned: pinned ?? this.store.get('pinned', DEFAULT_PINNED),
      webShortcuts: raw.webShortcuts,
      panel,
      snippets: product.snippets,
      workspaces: product.workspaces,
      aiActions: actions.map((value) =>
        Object.fromEntries(
          ['id', 'name', 'prompt', 'model', 'baseUrl'].map((key) => [
            key,
            (value as Record<string, unknown>)[key],
          ]),
        ),
      ) as unknown as ProfileCategories['aiActions'],
      plugins: this.plugins().map(({ manifest, enabled }) => ({
        id: manifest.id,
        version: manifest.version,
        enabled,
      })),
    };
  }
  export() {
    return (
      '// Nexlet configuration. API keys, history and tool drafts are excluded.\n' +
      plain({ version: 1, platform: process.platform, categories: this.snapshot() }) +
      '\n'
    );
  }
  preview(text: string): ProfilePreview {
    if (typeof text !== 'string' || Buffer.byteLength(text) > 4 * 1024 * 1024)
      throw Error(t('配置文件不能超过 4 MB'));
    const errors: ParseError[] = [];
    const value = parse(text, errors, { allowTrailingComma: true });
    if (errors.length) throw Error(t('JSONC 格式无效') + ': ' + errors[0].offset);
    const profile = validateProfile(value),
      current = this.snapshot(),
      token = randomUUID();
    this.pending = { token, hash: digest(current), profile };
    const warnings: string[] = [];
    if (profile.platform && profile.platform !== process.platform)
      warnings.push(t('配置来自其他平台，请检查路径和快捷键'));
    if (profile.categories.plugins) warnings.push(t('插件清单仅供核对，不会安装、卸载或启用插件'));
    if (profile.categories.aiActions)
      warnings.push(t('AI 动作不包含 API Key；导入后请重新打开插件'));
    return {
      token,
      warnings,
      changes: categories
        .filter(
          (key) =>
            key in profile.categories && plain(current[key]) !== plain(profile.categories[key]),
        )
        .map((category) => ({
          category,
          before: plain(current[category]),
          after: plain(profile.categories[category]),
        })),
    };
  }
  apply(
    token: string,
    selected: ProfileCategory[],
    wrap: ProfileWrite = (_next, write) => write(),
  ) {
    const pending = this.pending,
      current = this.snapshot();
    if (!pending || pending.token !== token || pending.hash !== digest(current))
      throw Error(t('配置已变化，请重新预览'));
    if (
      !Array.isArray(selected) ||
      !selected.length ||
      selected.some(
        (key) =>
          !categories.includes(key) || !(key in pending.profile.categories) || key === 'plugins',
      )
    )
      throw Error(t('请选择要导入的配置类别'));
    const next = {
      ...current,
      ...Object.fromEntries(selected.map((key) => [key, pending.profile.categories[key]])),
    } as ProfileCategories;
    this.write(next, selected, wrap, () =>
      this.store.set('config-profile-undo', { previous: current, selected }),
    );
    this.pending = null;
  }
  undo(wrap: ProfileWrite = (_next, write) => write()) {
    const saved = this.store.get<{
      previous: ProfileCategories;
      selected: ProfileCategory[];
    } | null>('config-profile-undo', null);
    if (!saved) throw Error(t('没有可撤销的配置导入'));
    const previous = {
      ...this.snapshot(),
      ...Object.fromEntries(saved.selected.map((key) => [key, saved.previous[key]])),
    } as ProfileCategories;
    this.write(previous, saved.selected, wrap, () => this.store.set('config-profile-undo', null));
    this.pending = null;
  }
  private write(
    next: ProfileCategories,
    selected: ProfileCategory[],
    wrap: ProfileWrite,
    extra: () => void,
  ) {
    this.store.db.exec('BEGIN IMMEDIATE');
    try {
      wrap(next, () => {
        if (selected.includes('settings') || selected.includes('webShortcuts'))
          this.store.set('settings', {
            ...this.store.settings(),
            ...next.settings,
            webShortcuts: next.webShortcuts,
          });
        if (selected.includes('commands') || selected.includes('pinned'))
          this.store.set('command-config', {
            ...next.commands,
            pinned: next.pinned,
            revision: this.store.get('command-config', defaultCommandConfig()).revision + 1,
          });
        if (selected.includes('panel'))
          this.store.set('panel-config', {
            ...next.panel,
            revision: this.store.get('panel-config', { revision: 0 }).revision + 1,
          });
        const product = this.store.get('productivity', defaultProductivity());
        if (selected.includes('snippets') || selected.includes('workspaces'))
          this.store.set('productivity', {
            ...product,
            revision: product.revision + 1,
            snippets: next.snippets,
            workspaces: next.workspaces,
          });
        const ai = this.store.get('plugin-data:org.nexlet.ai-actions', {});
        if (selected.includes('aiActions'))
          this.store.set('plugin-data:org.nexlet.ai-actions', { ...ai, actions: next.aiActions });
        extra();
      });
      this.store.db.exec('COMMIT');
    } catch (error) {
      this.store.db.exec('ROLLBACK');
      throw error;
    }
  }
}
