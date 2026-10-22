import type { Session } from 'electron';
import { realpath, open } from 'node:fs/promises';
import path from 'node:path';
import { safeEntryPath } from '../shared/plugin-validation';
import { pluginCsp, PLUGIN_FILE_LIMIT } from '../shared/plugin-policy';
import type { PluginRecord } from '../shared/types';
import { t } from '../shared/i18n';
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
};
export function configurePluginSession(isolated: Session, record: PluginRecord) {
  const id = record.manifest.id;
  const root = realpath(record.directory);
  void root.catch(() => {});
  isolated.setPermissionCheckHandler(() => false);
  isolated.setPermissionRequestHandler((_c, _p, reply) => reply(false));
  isolated.webRequest.onBeforeRequest((details, reply) => {
    const url = new URL(details.url);
    reply({
      cancel:
        !(url.protocol === 'nexlet-plugin:' && url.hostname === id) &&
        !['data:', 'blob:'].includes(url.protocol),
    });
  });
  isolated.protocol.handle('nexlet-plugin', async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== id) throw new Error(t('来源不符'));
      const directory = await root,
        relative = safeEntryPath(decodeURIComponent(url.pathname.slice(1))),
        file = await realpath(path.join(directory, relative)),
        relation = path.relative(directory, file);
      if (relation.startsWith('..') || path.isAbsolute(relation))
        throw new Error(t('资源不在插件目录中'));
      const handle = await open(file, 'r');
      let bytes: Buffer<ArrayBuffer>;
      try {
        const info = await handle.stat();
        if (!info.isFile() || info.size > PLUGIN_FILE_LIMIT) throw new Error(t('文件过大'));
        bytes = Buffer.alloc(info.size + 1);
        let bytesRead = 0;
        while (bytesRead < bytes.length) {
          const part = await handle.read(bytes, bytesRead, bytes.length - bytesRead, bytesRead);
          if (!part.bytesRead) break;
          bytesRead += part.bytesRead;
        }
        if (bytesRead !== info.size) throw new Error(t('文件过大'));
        bytes = bytes.subarray(0, bytesRead);
      } finally {
        await handle.close();
      }
      return new Response(bytes, {
        headers: {
          'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
          'Content-Security-Policy': pluginCsp(record.manifest.permissions),
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch {
      return new Response(t('无法读取插件资源'), { status: 403 });
    }
  });
}
