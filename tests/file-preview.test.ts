import { afterEach, expect, it } from 'vite-plus/test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { previewFile } from '../src/main/file-preview';
const directory = mkdtempSync(path.join(os.tmpdir(), 'nexlet-preview-'));
const paths: string[] = [];
afterEach(() => {
  for (const file of paths.splice(0)) rmSync(file, { recursive: true, force: true });
});
it('只读预览文本；大文件截断，二进制和目录明确拒绝', async () => {
  const file = path.join(directory, 'sample.txt');
  paths.push(file);
  writeFileSync(file, '中文<script>alert(1)</script>');
  expect(await previewFile(file)).toMatchObject({
    kind: 'text',
    text: '中文<script>alert(1)</script>',
    truncated: false,
  });
  writeFileSync(file, 'x'.repeat(600000));
  expect(await previewFile(file)).toMatchObject({ kind: 'text', truncated: true });
  writeFileSync(file, Buffer.from([0, 1, 2, 3]));
  expect(await previewFile(file)).toMatchObject({ kind: 'unavailable' });
  rmSync(file);
  mkdirSync(file);
  expect(await previewFile(file)).toMatchObject({ kind: 'unavailable' });
});
it('图片输出受限 PNG，不执行 SVG/HTML，也不解码超大像素', async () => {
  const file = path.join(directory, 'sample.png');
  paths.push(file);
  await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#fff' } })
    .png()
    .toFile(file);
  const result = await previewFile(file);
  expect(result.kind).toBe('image');
  if (result.kind === 'image') {
    expect(result.width).toBeLessThanOrEqual(960);
    expect(result.data).toMatch(/^data:image\/png;base64,/);
  }
  await sharp({ create: { width: 8000, height: 5000, channels: 3, background: '#fff' } })
    .png()
    .toFile(file);
  expect(await previewFile(file)).toMatchObject({ kind: 'unavailable' });
});
