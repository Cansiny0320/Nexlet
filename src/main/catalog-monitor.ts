import { watch, type FSWatcher } from 'node:fs';
import { stat } from 'node:fs/promises';

export type DirectorySnapshot = { identity: string; version: string } | null;

export async function readDirectorySnapshot(directory: string): Promise<DirectorySnapshot> {
  const info = await stat(directory).catch(() => null);
  if (!info?.isDirectory()) return null;
  return {
    identity: `${info.dev}:${info.ino}`,
    version: `${info.dev}:${info.ino}:${info.mtimeMs}:${info.ctimeMs}`,
  };
}

export class CatalogMonitor {
  private watchers = new Map<string, { watcher: FSWatcher; identity: string }>();
  private debounce?: ReturnType<typeof setTimeout>;
  private closed = false;
  private snapshots = new Map<string, DirectorySnapshot>();
  private systemVersion?: string;
  private checking?: Promise<void>;

  constructor(
    private refresh: () => Promise<void>,
    private readSystemVersion?: () => Promise<string>,
  ) {}

  check(): Promise<void> {
    if (this.closed) return Promise.resolve();
    return (this.checking ??= this.checkOnce().finally(() => {
      this.checking = undefined;
    }));
  }

  private async checkOnce() {
    const snapshots = this.snapshots;
    for (const [directory, previous] of snapshots) {
      const current = await readDirectorySnapshot(directory);
      if (this.closed || snapshots !== this.snapshots) return;
      // Release deleted/replaced handles before a potentially slow catalog scan.
      // Also retry failed watches when the directory itself is unchanged.
      this.ensureWatcher(directory, current);
      if (current?.version !== previous?.version) {
        await this.refresh();
        return;
      }
    }
    if (this.readSystemVersion) {
      const version = await this.readSystemVersion();
      if (!this.closed && snapshots === this.snapshots && version !== this.systemVersion)
        await this.refresh();
    }
  }

  private run() {
    if (this.closed) return;
    clearTimeout(this.debounce);
    this.debounce = undefined;
    void this.refresh().catch((error) => console.warn('Application catalog refresh failed', error));
  }

  private schedule = () => {
    if (this.closed) return;
    // Bound the delay even if an installer keeps producing events.
    this.debounce ??= setTimeout(() => this.run(), 750);
    this.debounce.unref();
  };

  update(snapshots: Map<string, DirectorySnapshot>, systemVersion?: string) {
    if (this.closed) return;
    this.snapshots = snapshots;
    this.systemVersion = systemVersion;
    for (const [directory, entry] of this.watchers) {
      if (!snapshots.has(directory)) {
        entry.watcher.close();
        this.watchers.delete(directory);
      }
    }
    for (const [directory, snapshot] of snapshots) this.ensureWatcher(directory, snapshot);
  }

  private ensureWatcher(directory: string, snapshot: DirectorySnapshot) {
    const previous = this.watchers.get(directory);
    const identity = snapshot?.identity;
    if (identity && previous?.identity === identity) return;
    // Keep stable watches, but rebind paths whose directory inode was replaced.
    previous?.watcher.close();
    this.watchers.delete(directory);
    if (!identity) return;
    try {
      let checking = false;
      const current = () => !this.closed && this.watchers.get(directory)?.watcher === watcher;
      const watcher = watch(directory, { persistent: false }, () => {
        if (!current() || checking) return;
        checking = true;
        // Windows may emit endless successful rename events for a deleted
        // directory. Validate the handle's identity independently of scanning;
        // waiting for an error or a completed scan can leave it spinning.
        void readDirectorySnapshot(directory)
          .then((snapshot) => {
            if (!current()) return;
            this.ensureWatcher(directory, snapshot);
            this.schedule();
          })
          .finally(() => {
            checking = false;
          });
      });
      watcher.on('error', () => {
        if (!current()) return;
        watcher.close();
        this.watchers.delete(directory);
        this.schedule();
      });
      this.watchers.set(directory, { watcher, identity });
    } catch {
      /* A missing/inaccessible root is retried on wake. */
    }
  }

  close() {
    this.closed = true;
    clearTimeout(this.debounce);
    for (const { watcher } of this.watchers.values()) watcher.close();
    this.watchers.clear();
    this.snapshots.clear();
  }
}
