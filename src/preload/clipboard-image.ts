import { ipcRenderer, nativeImage } from 'electron';
import { createHash, randomUUID } from 'node:crypto';
import { access, writeFile, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import type { ImageRequest, ImageResponse } from '../main/clipboard-image';

async function processImage({ work }: ImageRequest): Promise<ImageResponse['value']> {
  const bytes =
    work.kind === 'capture'
      ? work.bytes
      : await readFile(work.file).catch(() => {
          throw Error('图片附件不存在');
        });
  const picture = nativeImage.createFromBuffer(Buffer.from(bytes));
  if (picture.isEmpty()) {
    if (work.kind === 'copy') throw Error('图片附件不存在');
    return null;
  }
  const { width, height } = picture.getSize();
  if (width * height > 36_000_000) throw Error('图片过大，本次未记录（最多 3600 万像素）');
  const png = picture.toPNG();
  if (png.length > 20 * 1024 * 1024) throw Error('图片超过 20 MB，本次未记录');
  if (work.kind === 'copy') return new Uint8Array(png);
  const hash = createHash('sha256').update(png).digest('hex');
  const imagePath = path.join(work.directory, hash + '.png');
  try {
    await access(imagePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const temporary = path.join(work.directory, `.${hash}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, png, { flag: 'wx' });
      await rename(temporary, imagePath);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  const thumbnail = picture.resize({ width: Math.min(360, width) }).toDataURL();
  return { hash, imagePath, thumbnail, width, height };
}

let pending = Promise.resolve();
ipcRenderer.on('clipboard-image:run', (_event, request: ImageRequest) => {
  pending = pending.then(async () => {
    const response: ImageResponse = { id: request.id };
    try {
      response.value = await processImage(request);
    } catch (error) {
      response.error = error instanceof Error ? error.message : String(error);
    }
    ipcRenderer.send('clipboard-image:result', response);
  });
});
