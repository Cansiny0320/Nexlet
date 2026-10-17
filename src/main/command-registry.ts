import { t } from '../shared/i18n';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import {
  defaultCommandConfig,
  DEFAULT_PINNED,
  MATCH_TARGETS,
  type CommandConfig,
  type CommandPreference,
} from '../shared/command-config';
import type { Command } from '../shared/types';
import { migrateCommandConfig, migrateCommandIds } from './command-migrations';

interface Storage {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
}
const string = (value: unknown, max: number) => {
  if (typeof value !== 'string' || value.length > max || /[\0\r\n]/.test(value))
    throw Error(t('文本参数无效'));
  return value.trim();
};
const idOf = (value: unknown) => {
  const id = string(value, 250);
  if (!id || ['__proto__', 'constructor', 'prototype'].includes(id)) throw Error(t('功能 ID 无效'));
  return id;
};
export class CommandRegistry {
  constructor(
    private store: Storage,
    private resolveIds: (ids: string[]) => string[] = (ids) => ids,
  ) {
    const previous = this.read(),
      next = migrateCommandConfig(previous);
    if (next !== previous) this.save(next);
    for (const key of ['pinned', 'recent']) {
      const old = this.store.get<string[]>(key, []),
        mapped = migrateCommandIds(old);
      if (JSON.stringify(old) !== JSON.stringify(mapped)) this.store.set(key, mapped);
    }
  }
  read(): CommandConfig {
    return this.store.get('command-config', defaultCommandConfig());
  }
  save(next: CommandConfig) {
    this.store.set('command-config', next);
  }
  pinned(config = this.read()): string[] {
    return [...new Set(this.resolveIds(config.pinned ?? this.store.get('pinned', DEFAULT_PINNED)))];
  }
  enabled(id: string, config = this.read()) {
    return config.commands[MATCH_TARGETS[id] || id]?.disabled !== true;
  }
  assertEnabled(id: string) {
    if (!this.enabled(id)) throw Error(t('此功能已禁用，请先在功能管理中启用'));
  }
  commands(source: Command[], includeDisabled = false, config = this.read()): Command[] {
    const local: Command[] = config.localEntries.map((e) => ({
      id: 'local:' + e.id,
      name: e.name,
      subtitle: e.path,
      path: e.path,
      kind: 'local',
      keywords: [],
      color: '#c38b43',
    }));
    return [...source, ...local]
      .filter((c) => includeDisabled || this.enabled(c.id, config))
      .map((c) => ({ ...c, keywords: [...c.keywords, ...(config.commands[c.id]?.aliases || [])] }));
  }
  prepare(args: Record<string, any>): CommandConfig {
    const previous = this.read(),
      next = structuredClone(previous);
    next.revision++;
    if (args.action === 'patch') {
      const id = idOf(args.id),
        patch = args.patch;
      if (!patch || typeof patch !== 'object' || Array.isArray(patch))
        throw Error(t('功能配置无效'));
      const value: CommandPreference = { ...next.commands[id] };
      if ('aliases' in patch) {
        if (!Array.isArray(patch.aliases) || patch.aliases.length > 20)
          throw Error(t('别名最多 20 个'));
        value.aliases = [
          ...new Set<string>(patch.aliases.map((a: unknown) => string(a, 60)).filter(Boolean)),
        ];
      }
      if ('shortcut' in patch) value.shortcut = string(patch.shortcut, 80);
      if ('disabled' in patch) {
        if (typeof patch.disabled !== 'boolean') throw Error(t('禁用状态无效'));
        value.disabled = patch.disabled;
      }
      if ('captureSelection' in patch) {
        if (typeof patch.captureSelection !== 'boolean') throw Error(t('选区开关无效'));
        value.captureSelection = patch.captureSelection;
      }
      next.commands[id] = value;
    } else if (args.action === 'pin') {
      const id = idOf(args.id),
        old = this.pinned(previous);
      next.pinned = old.includes(id) ? old.filter((v) => v !== id) : [...old, id];
    } else if (args.action === 'reorder') {
      if (args.revision !== previous.revision)
        throw Error(t('固定项已在其他窗口修改，请刷新后重试'));
      const old = this.pinned(previous),
        list = args.ids;
      if (
        !Array.isArray(list) ||
        list.length !== old.length ||
        new Set(list).size !== old.length ||
        list.some((id) => !old.includes(id))
      )
        throw Error(t('固定项列表无效'));
      next.pinned = [...list];
    } else if (args.action === 'layout') {
      if (!['grid', 'list'].includes(args.value)) throw Error(t('展示方式无效'));
      next.layout = args.value;
    } else if (args.action === 'localSave') {
      const name = string(args.name, 60),
        target = string(args.path, 32767);
      if (!name || !path.isAbsolute(target)) throw Error(t('请输入名称和绝对路径'));
      const id = args.id ? idOf(args.id) : randomUUID(),
        existing = next.localEntries.find((e) => e.id === id);
      if (args.id && !existing) throw Error(t('本地启动项已不存在'));
      const entry = { id, name, path: target };
      if (existing) next.localEntries = next.localEntries.map((e) => (e.id === id ? entry : e));
      else {
        if (next.localEntries.length >= 200) throw Error(t('最多保存 200 个本地启动项'));
        next.localEntries.push(entry);
      }
    } else if (args.action === 'localRemove') {
      const id = idOf(args.id);
      next.localEntries = next.localEntries.filter((e) => e.id !== id);
    } else throw Error(t('功能管理操作无效'));
    return next;
  }
}
