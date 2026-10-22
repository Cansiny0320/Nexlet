import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { t } from '../shared/i18n';
import type { FilePreview } from '../shared/file-preview';
const textLimit = 256 * 1024,
  imageLimit = 20 * 1024 * 1024;
export async function previewFile(file: string): Promise<FilePreview> {
  const unavailable = (reason: string): FilePreview => ({ kind: 'unavailable', reason });
  // Non-blocking prevents named pipes from holding the preview request open.
  const handle = await open(file, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) return unavailable(t('此项目不支持内容预览'));
    const image = /\.(?:png|jpe?g|webp|gif|avif|tiff?)$/i.test(path.extname(file));
    if (image && stat.size > imageLimit) return unavailable(t('图片超过 20 MB，无法预览'));
    const buffer = Buffer.alloc(Math.min(stat.size, image ? imageLimit : textLimit));
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    const data = buffer.subarray(0, length);
    if (image) {
      try {
        const result = await sharp(data, { limitInputPixels: 36_000_000, animated: false })
          .rotate()
          .resize(960, 720, { fit: 'inside', withoutEnlargement: true })
          .png()
          .toBuffer({ resolveWithObject: true });
        return {
          kind: 'image',
          data: 'data:image/png;base64,' + result.data.toString('base64'),
          width: result.info.width,
          height: result.info.height,
        };
      } catch {
        return unavailable(t('图片无法解码或超过 3600 万像素'));
      }
    }
    if (
      data.includes(0) ||
      [...data.subarray(0, 8192)].some((byte) => byte < 9 || (byte > 13 && byte < 32))
    )
      return unavailable(t('二进制文件不支持文本预览'));
    try {
      const decoder = new TextDecoder('utf-8', { fatal: true });
      return {
        kind: 'text',
        text: decoder.decode(data, { stream: stat.size > length }),
        truncated: stat.size > length,
      };
    } catch {
      return unavailable(t('此文件不是有效的 UTF-8 文本'));
    }
  } finally {
    await handle.close();
  }
}
