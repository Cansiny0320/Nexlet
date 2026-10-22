import { app, nativeImage } from 'electron';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { gt } from 'semver';
import { t } from '../shared/i18n';
import type { PluginRecord } from '../shared/types';
import type { PluginBundle } from './plugin-bundle';
import type { Store } from './store';

interface StagedUpdate {
  baseDirectory: string;
  hostVersion: string;
  record: PluginRecord;
}
const key = 'plugin-staged-updates';

/** Prepared files survive app restarts, but never change an active installation. */
export class PluginStaging {
  constructor(
    private store: Store,
    private root: string,
  ) {}
  private all() {
    return this.store.get<Record<string, StagedUpdate>>(key, {});
  }
  ready(previous: PluginRecord, code: string): PluginRecord | null {
    const staged = this.all()[previous.manifest.id];
    if (
      !staged ||
      staged.baseDirectory !== previous.directory ||
      staged.hostVersion !== app.getVersion() ||
      !gt(staged.record.manifest.version, previous.manifest.version) ||
      !staged.record.manifest.features.some((feature) => feature.code === code)
    )
      return null;
    return staged.record;
  }
  async forget(id: string): Promise<void> {
    const records = this.all(),
      staged = records[id];
    if (!staged) return;
    delete records[id];
    this.store.set(key, records);
    // An interrupted activation may already have committed this directory.
    if (
      !this.store
        .get<PluginRecord[]>('plugins', [])
        .some((record) => record.directory === staged.record.directory)
    )
      await this.remove(staged.record.directory);
  }
  async prepare(previous: PluginRecord, bundle: PluginBundle, current: () => boolean) {
    if (!current()) return;
    const directory = path.join(this.root, bundle.manifest.id, randomUUID());
    try {
      let icon: string | undefined;
      if (bundle.manifest.icon) {
        const image = nativeImage.createFromBuffer(bundle.files.get(bundle.manifest.icon)!);
        if (image.isEmpty()) throw Error(t('插件 PNG 图标无法解码'));
        icon = image.resize({ width: 64, height: 64 }).toDataURL();
      }
      for (const [name, bytes] of bundle.files) {
        const file = path.join(directory, name);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, bytes, { mode: 0o600 });
      }
      if (!current()) {
        await this.remove(directory);
        return;
      }
      await this.forget(previous.manifest.id);
      if (!current()) {
        await this.remove(directory);
        return;
      }
      this.store.set(key, {
        ...this.all(),
        [previous.manifest.id]: {
          baseDirectory: previous.directory,
          hostVersion: app.getVersion(),
          record: {
            manifest: bundle.manifest,
            directory,
            enabled: true,
            development: false,
            installedAt: Date.now(),
            source: 'marketplace',
            icon,
          },
        } satisfies StagedUpdate,
      });
    } catch (error) {
      await this.remove(directory);
      throw error;
    }
  }
  private async remove(directory: string) {
    const relative = path.relative(path.resolve(this.root), path.resolve(directory));
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
      throw Error(t('拒绝清理非托管插件目录'));
    await rm(directory, { recursive: true, force: true });
  }
}
