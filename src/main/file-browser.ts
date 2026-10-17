import { t } from '../shared/i18n';
import { opendir, stat } from 'node:fs/promises';
import type { Dir } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DirectoryPage, FileInfo, FileResult } from '../shared/everything';

interface Listing {
  path: string;
  filter: string;
  grants: Set<string>;
  dir: Dir | null;
  cursor: string;
  busy: boolean;
  disposed: boolean;
}
function fileError(error: unknown): Error {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'ENOENT') return new Error(t('文件或文件夹已移动、删除或不存在'));
  if (code === 'EACCES' || code === 'EPERM') return new Error(t('没有权限访问此文件或文件夹'));
  if (code === 'ENOTDIR') return new Error(t('此项目不是文件夹'));
  return error instanceof Error ? error : new Error(t('无法读取文件信息'));
}
export class FileBrowser {
  private listings = new Map<number, Listing>();
  constructor(private grants: (owner: number) => Set<string> | undefined) {}
  private authorize(owner: number, file: string) {
    const grants = this.grants(owner);
    if (typeof file !== 'string' || !grants?.has(file))
      throw new Error(t('请从当前搜索或目录结果中选择文件'));
    return grants;
  }
  async info(owner: number, file: string): Promise<FileInfo> {
    this.authorize(owner, file);
    try {
      const info = await stat(file),
        directory = info.isDirectory();
      return {
        path: file,
        name: path.basename(file) || file,
        parent: path.dirname(file),
        directory,
        size: directory ? null : info.size,
        created: info.birthtimeMs > 0 ? info.birthtime.toISOString() : '',
        modified: info.mtime.toISOString(),
      };
    } catch (error) {
      throw fileError(error);
    }
  }
  async browse(owner: number, file: string, filter = '', cursor?: string): Promise<DirectoryPage> {
    const grants = this.authorize(owner, file);
    if (typeof filter !== 'string' || filter.length > 1024) throw new Error(t('目录筛选内容无效'));
    let listing: Listing;
    if (cursor) {
      const current = this.listings.get(owner);
      if (
        !current ||
        current.cursor !== cursor ||
        current.path !== file ||
        current.filter !== filter ||
        current.grants !== grants ||
        current.busy
      )
        throw new Error(t('目录分页已过期，请刷新'));
      listing = current;
    } else {
      this.forget(owner);
      listing = {
        path: file,
        filter,
        grants,
        dir: null,
        cursor: randomUUID(),
        busy: false,
        disposed: false,
      };
      this.listings.set(owner, listing);
    }
    listing.busy = true;
    const active = () =>
      !listing.disposed && this.listings.get(owner) === listing && this.grants(owner) === grants;
    try {
      listing.dir ??= await opendir(file);
      if (!active()) throw new Error(t('目录请求已过期'));
      const items: FileResult[] = [];
      let done = false;
      // Bound both returned rows and scanning work; even sparse filters yield.
      for (let scanned = 0; scanned < 500 && items.length < 100; scanned++) {
        const entry = await listing.dir.read();
        if (!active()) throw new Error(t('目录请求已过期'));
        if (!entry) {
          done = true;
          break;
        }
        if (!entry.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase())) continue;
        const child = path.join(file, entry.name);
        let directory = entry.isDirectory();
        if (entry.isSymbolicLink())
          directory = await stat(child).then(
            (info) => info.isDirectory(),
            () => false,
          );
        items.push({
          path: child,
          name: entry.name,
          parent: file,
          directory,
          size: null,
          modified: '',
        });
      }
      if (!active()) throw new Error(t('目录请求已过期'));
      const ancestors: { path: string; name: string }[] = [];
      for (let parent = file; ;) {
        ancestors.unshift({ path: parent, name: path.basename(parent) || parent });
        const next = path.dirname(parent);
        if (parent === next) break;
        parent = next;
      }
      for (const item of [...items, ...ancestors]) grants.add(item.path);
      items.sort(
        (a, b) =>
          Number(b.directory) - Number(a.directory) ||
          a.name.localeCompare(b.name, undefined, { numeric: true }),
      );
      listing.cursor = randomUUID();
      if (done) this.forget(owner);
      return {
        path: file,
        parent: path.dirname(file) === file ? null : path.dirname(file),
        ancestors,
        items,
        cursor: done ? null : listing.cursor,
      };
    } catch (error) {
      if (this.listings.get(owner) === listing) this.forget(owner);
      throw fileError(error);
    } finally {
      listing.busy = false;
      if (listing.disposed && listing.dir) await listing.dir.close().catch(() => {});
    }
  }
  forget(owner: number) {
    const listing = this.listings.get(owner);
    if (!listing) return;
    this.listings.delete(owner);
    listing.disposed = true;
    if (!listing.busy && listing.dir) void listing.dir.close().catch(() => {});
  }
  reset() {
    for (const owner of this.listings.keys()) this.forget(owner);
  }
}
