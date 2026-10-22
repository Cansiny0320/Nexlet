import { mkdtemp, writeFile, rename, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vite-plus/test';
import { LaunchInputs } from '../src/main/launch-input';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nexlet-input-'));
  directories.push(root);
  const file = path.join(root, 'sample.json');
  await writeFile(file, '{"value":1}');
  return { root, file };
}
it('结果交接保留 HTML，文件重新授权且源插件退出后仍可读取', async () => {
  const { file } = await fixture(),
    inputs = new LaunchInputs();
  const text = await inputs.publish(1, {
    type: 'text',
    text: '表格',
    html: '<table><tr><td>表格</td></tr></table>',
  });
  expect(text).toMatchObject({
    type: 'text',
    from: 'result',
    html: '<table><tr><td>表格</td></tr></table>',
  });
  const input = await inputs.capture(1, { type: 'files', paths: [file], from: 'drop' });
  const granted = inputs.grant(10, inputs.get(1, input.id));
  if (granted.type !== 'files') throw Error('files expected');
  const handed = await inputs.publish(2, { type: 'files', resources: [granted.files[0].id] }, 10);
  if (handed.type !== 'files') throw Error('files expected');
  expect(handed.files[0].id).not.toBe(granted.files[0].id);
  inputs.revoke(10);
  const next = inputs.grant(20, inputs.get(2, handed.id));
  if (next.type !== 'files') throw Error('files expected');
  expect(Buffer.from(await inputs.read(20, next.files[0].id)).toString()).toBe('{"value":1}');
  await expect(inputs.publish(2, { type: 'files', paths: [file] }, 10)).rejects.toThrow('授权');
});
it('文件只授权给选中的会话，新输入与新授权分别撤销旧引用', async () => {
  const { file } = await fixture(),
    inputs = new LaunchInputs();
  const input = await inputs.capture(1, { type: 'files', paths: [file], from: 'drop' });
  const granted = inputs.grant(10, inputs.get(1, input.id));
  if (granted.type !== 'files') throw new Error('expected files');
  const token = granted.files[0].id;
  expect(Buffer.from(await inputs.read(10, token)).toString()).toBe('{"value":1}');
  await expect(inputs.read(11, token)).rejects.toThrow('输入资源');
  const next = inputs.setText(1, 'next', 'input');
  expect(() => inputs.get(1, input.id)).toThrow('输入已变化');
  // Replacing the launcher input must not invalidate an already selected plugin's snapshot.
  expect(Buffer.from(await inputs.read(10, token)).toString()).toBe('{"value":1}');
  inputs.grant(10, inputs.get(1, next.id));
  await expect(inputs.read(10, token)).rejects.toThrow('输入资源');
});
it('检测文件替换与修改，不读取同路径的新内容', async () => {
  const { root, file } = await fixture(),
    inputs = new LaunchInputs();
  const input = await inputs.capture(1, { type: 'files', paths: [file], from: 'paste' });
  const granted = inputs.grant(10, inputs.get(1, input.id));
  if (granted.type !== 'files') throw new Error('expected files');
  await rename(file, path.join(root, 'old.json'));
  await writeFile(file, '{"value":2}');
  await expect(inputs.read(10, granted.files[0].id)).rejects.toThrow('变化');
});
it('图片资源无持久化副作用，撤销和大小校验有效', async () => {
  const inputs = new LaunchInputs(() => ({ width: 1, height: 1 }));
  const input = await inputs.capture(1, {
    type: 'image',
    data: 'data:image/png;base64,aGVsbG8=',
    from: 'paste',
  });
  const granted = inputs.grant(10, inputs.get(1, input.id));
  if (granted.type !== 'image') throw new Error('expected image');
  expect(Buffer.from(await inputs.read(10, granted.image.id)).toString()).toBe('hello');
  inputs.revoke(10);
  await expect(inputs.read(10, granted.image.id)).rejects.toThrow('输入资源');
  await expect(
    inputs.capture(1, { type: 'files', paths: Array(101).fill('/fake'), from: 'drop' }),
  ).rejects.toThrow();
  await expect(
    inputs.capture(1, { type: 'image', data: 'data:text/html;base64,aGVsbG8=', from: 'paste' }),
  ).rejects.toThrow();
});
it('目录仅传元信息，不允许作为文件读取；宿主之间输入隔离', async () => {
  const { root } = await fixture(),
    inputs = new LaunchInputs();
  const input = await inputs.capture(1, { type: 'files', paths: [root], from: 'drop' });
  expect(() => inputs.get(2, input.id)).toThrow();
  const granted = inputs.grant(10, inputs.get(1, input.id));
  if (granted.type !== 'files') throw new Error('expected files');
  expect(granted.files[0].isDirectory).toBe(true);
  await expect(inputs.read(10, granted.files[0].id)).rejects.toThrow('目录');
});
it('选区资源转入主窗口后，关闭面板不撤销已授予插件的资源', async () => {
  const { file } = await fixture(),
    inputs = new LaunchInputs();
  const input = await inputs.captureSelection(1, { type: 'files', paths: [file] });
  expect(input.from).toBe('selection');
  inputs.transfer(1, 2, input.id);
  const granted = inputs.grant(30, inputs.get(2, input.id));
  if (granted.type !== 'files') throw Error('expected files');
  inputs.clear(1);
  inputs.clear(2);
  expect(Buffer.from(await inputs.read(30, granted.files[0].id)).toString()).toBe('{"value":1}');
  inputs.revoke(30);
  await expect(inputs.read(30, granted.files[0].id)).rejects.toThrow('失效');
  await expect(
    inputs.capture(1, { type: 'files', paths: [file], from: 'selection' }),
  ).rejects.toThrow('来源');
});
