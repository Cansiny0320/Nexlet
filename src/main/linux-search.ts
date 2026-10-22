import { t } from '../shared/i18n';
import { opendir, lstat } from 'node:fs/promises';
import type { Dir, Dirent, Stats } from 'node:fs';
import { setImmediate as yieldLoop } from 'node:timers/promises';
import path from 'node:path';
import type { FileResult, FileSearchResult } from '../shared/everything';
// Greedy glob matching avoids unbounded RegExp backtracking on repeated * tokens.
function glob(name: string, pattern: string): boolean {
  const text = Array.from(name.toLocaleLowerCase()),
    tokens = Array.from(pattern.toLocaleLowerCase());
  let i = 0,
    j = 0,
    star = -1,
    retry = 0;
  while (i < text.length) {
    if (tokens[j] === '?' || tokens[j] === text[i]) {
      i++;
      j++;
    } else if (tokens[j] === '*') {
      star = j++;
      retry = i;
    } else if (star >= 0) {
      j = star + 1;
      i = ++retry;
    } else return false;
  }
  while (tokens[j] === '*') j++;
  return j === tokens.length;
}
export function linuxFilenameMatcher(query: string): (name: string) => boolean {
  if (query.length > 1024 || /[\0\r\n]/.test(query))
    throw Error(t('搜索内容最多 1024 字符，且不能包含换行'));
  const tokens = query.match(/"[^"]*"|\S+/g) || [];
  if ((query.match(/"/g) || []).length % 2) throw Error(t('请补全搜索短语的双引号'));
  const patterns = tokens.map((token) => {
    let value = token.replace(/^"|"$/g, '');
    if (/^ext:/i.test(value)) {
      value = value.slice(4);
      if (!/^[\p{L}\p{N}_-]+$/u.test(value)) throw Error(t('扩展名筛选格式为 ext:pdf'));
      value = '*.' + value;
    } else if (/^[a-z]+:/i.test(value)) throw Error(t('Linux 支持文件名、通配符和 ext:pdf'));
    if (!/[*?]/.test(value)) value = '*' + value + '*';
    return value;
  });
  return (name) => patterns.every((pattern) => glob(name, pattern));
}
export class LinuxFileSearch {
  private pending = new Map<number, AbortController>();
  private directories = new Map<string, { identity: string; entries: Dirent[]; bytes: number }>();
  private cacheBytes = 0;
  private scopesKey = '';
  private generation = 0;
  constructor(
    private paths: () => string[],
    private io: { opendir(folder: string): Promise<Dir>; lstat(file: string): Promise<Stats> } = {
      opendir: (folder) => opendir(folder),
      lstat: (file) => lstat(file),
    },
  ) {}
  private forgetDirectory(folder: string) {
    const old = this.directories.get(folder);
    if (old) this.cacheBytes -= old.bytes;
    this.directories.delete(folder);
  }
  private remember(folder: string, identity: string, entries: Dirent[]) {
    const bytes =
      folder.length * 2 + 128 + entries.reduce((sum, entry) => sum + entry.name.length * 2 + 96, 0);
    this.forgetDirectory(folder);
    if (bytes > 32 * 1024 * 1024) return;
    while (this.cacheBytes + bytes > 32 * 1024 * 1024 || this.directories.size >= 10_000)
      this.forgetDirectory(this.directories.keys().next().value!);
    this.directories.set(folder, { identity, entries, bytes });
    this.cacheBytes += bytes;
  }
  async search(owner: number, query: string): Promise<FileSearchResult> {
    this.forget(owner);
    const scopes = [...new Set(this.paths())],
      empty = { items: [], limited: false, scopes };
    const scopesKey = JSON.stringify(scopes);
    if (scopesKey !== this.scopesKey) {
      this.reset();
      this.scopesKey = scopesKey;
    }
    if (!query.trim())
      return {
        status: 'idle',
        message: t('输入文件名，支持多关键词、*.pdf 和 ext:pdf；请先在设置中添加搜索目录'),
        ...empty,
      };
    if (!scopes.length)
      return { status: 'unavailable', message: t('请先在设置中添加文件搜索目录'), ...empty };
    if (scopes.some((p) => !path.isAbsolute(p)))
      return { status: 'unavailable', message: t('搜索目录必须是绝对路径'), ...empty };
    const matches = linuxFilenameMatcher(query),
      controller = new AbortController(),
      { signal } = controller;
    const generation = this.generation;
    this.pending.set(owner, controller);
    const items: FileResult[] = [],
      seen = new Set<string>(),
      deadline = Date.now() + 5000;
    let limited = false,
      visited = 0,
      readable = 0,
      skipped = 0;
    const visit = async (folder: string, depth: number): Promise<void> => {
      signal.throwIfAborted();
      if (items.length >= 200 || Date.now() > deadline || visited >= 100000 || depth > 64) {
        limited = true;
        return;
      }
      if (seen.has(folder)) return;
      seen.add(folder);
      let directory: AsyncIterable<Dirent> | Dirent[], identity: string;
      let cached = false;
      try {
        const info = await this.io.lstat(folder);
        if (!info.isDirectory()) {
          this.forgetDirectory(folder);
          return;
        }
        identity = [info.dev, info.ino, info.mtimeMs, info.ctimeMs, info.mode].join(':');
        const previous = this.directories.get(folder);
        if (previous?.identity === identity) {
          directory = previous.entries;
          cached = true;
          this.directories.delete(folder);
          this.directories.set(folder, previous);
        } else {
          this.forgetDirectory(folder);
          directory = await this.io.opendir(folder);
        }
        readable++;
      } catch {
        this.forgetDirectory(folder);
        skipped++;
        return;
      }
      const entries: Dirent[] = [];
      let complete = true;
      for await (const entry of directory) {
        signal.throwIfAborted();
        if (items.length >= 200 || Date.now() > deadline || visited++ >= 100000) {
          limited = true;
          complete = false;
          break;
        }
        if (!cached) entries.push(entry);
        // Cached directories can contain many nonmatches; let newer queries cancel promptly.
        if (cached && visited % 256 === 0) {
          await yieldLoop();
          signal.throwIfAborted();
        }
        if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
        const file = path.join(folder, entry.name);
        if (matches(entry.name))
          try {
            const info = await this.io.lstat(file);
            if (!info.isSymbolicLink())
              items.push({
                path: file,
                name: entry.name,
                parent: folder,
                directory: info.isDirectory(),
                size: info.isDirectory() ? null : info.size,
                modified: info.mtime.toISOString(),
              });
          } catch {}
        if (entry.isDirectory()) await visit(file, depth + 1);
      }
      if (!cached && complete && generation === this.generation)
        this.remember(folder, identity, entries);
    };
    try {
      for (const scope of scopes) await visit(scope, 0);
      signal.throwIfAborted();
      return {
        status: readable ? 'ready' : 'unavailable',
        message: !readable
          ? t('搜索目录无法访问')
          : limited
            ? t('搜索达到数量或时间上限，请缩小目录或补充关键词')
            : skipped
              ? t('部分目录无法访问，已显示可读取的结果')
              : items.length
                ? ''
                : t('没有找到相关文件'),
        items,
        limited,
        scopes,
      };
    } catch (error) {
      if (signal.aborted) return { status: 'idle', message: '', ...empty };
      return {
        status: 'unavailable',
        message: t('文件搜索失败：{{v0}}', { v0: (error as Error).message }),
        ...empty,
      };
    } finally {
      if (this.pending.get(owner) === controller) this.pending.delete(owner);
    }
  }
  forget(owner: number) {
    this.pending.get(owner)?.abort();
    this.pending.delete(owner);
  }
  reset() {
    for (const owner of this.pending.keys()) this.forget(owner);
    this.directories.clear();
    this.cacheBytes = 0;
    this.generation++;
  }
}
