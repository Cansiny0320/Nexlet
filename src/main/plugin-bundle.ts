import AdmZip from 'adm-zip';
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { safeEntryPath, validateManifest } from '../shared/plugin-validation';
import type { PluginManifest } from '../shared/types';

export interface PluginBundle { manifest: PluginManifest; files: Map<string, Buffer>; }
const MAX_TOTAL = 50 * 1024 * 1024;
export function readPluginZip(buffer: Buffer): PluginBundle {
  if (buffer.length > 25 * 1024 * 1024) throw new Error('插件压缩包不能超过 25 MB');
  const archive = new AdmZip(buffer);
  const entries = archive.getEntries();
  if (entries.length > 2000) throw new Error('插件文件数量过多');
  const files = new Map<string, Buffer>(), seen = new Set<string>();
  let total = 0;
  for (const entry of entries) {
    const name = safeEntryPath(entry.entryName.replace(/\/$/, ''));
    const key = name.toLowerCase();
    if (seen.has(key)) throw new Error('插件存在重复文件路径');
    seen.add(key);
    if (((entry.attr >>> 16) & 0xf000) === 0xa000) throw new Error('插件不能包含符号链接');
    if (entry.isDirectory) continue;
    if (entry.header.size > 10 * 1024 * 1024 || (total += entry.header.size) > MAX_TOTAL) throw new Error('插件解压大小超过限制');
    const data = entry.getData();
    if (data.length !== entry.header.size) throw new Error('插件文件长度与声明不符');
    files.set(name, data);
  }
  return finish(files);
}
export async function readPluginDirectory(directory: string): Promise<PluginBundle> {
  const root = await realpath(directory); const files = new Map<string, Buffer>(); let total = 0;
  const visit = async (relative: string) => {
    const entries = await readdir(path.join(root, relative), { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const name = safeEntryPath(relative ? `${relative}/${entry.name}` : entry.name);
      if (entry.isSymbolicLink()) throw new Error('插件不能包含符号链接');
      if (entry.isDirectory()) { await visit(name); continue; }
      if (!entry.isFile()) throw new Error('插件包含非普通文件');
      if (files.size >= 2000) throw new Error('插件文件数量过多');
      const file = path.join(root, name), info = await lstat(file);
      if (info.size > 10 * 1024 * 1024 || (total += info.size) > MAX_TOTAL) throw new Error('插件大小超过限制');
      files.set(name, await readFile(file));
    }
  };
  await visit(''); return finish(files);
}
function finish(files: Map<string, Buffer>): PluginBundle {
  const config = files.get('plugin.json');
  if (!config || config.length > 64 * 1024) throw new Error('插件根目录需要 plugin.json（小于 64 KB）');
  const manifest = validateManifest(JSON.parse(config.toString('utf8')));
  if (!files.has(manifest.main)) throw new Error('找不到插件入口 HTML');
  return { manifest, files };
}
