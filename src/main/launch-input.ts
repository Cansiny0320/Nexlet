import { t } from '../shared/i18n';
import { open, realpath, stat } from 'node:fs/promises';
import { constants, type Stats } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { SelectionContent } from './selection';
import {
  INPUT_FILE_LIMIT,
  INPUT_RESOURCE_LIMIT,
  INPUT_TOTAL_LIMIT,
  INPUT_TEXT_LIMIT,
  type InputSource,
  type LaunchInput,
  type InputResource,
} from '../shared/launch';

interface Resource {
  descriptor: InputResource;
  file?: { path: string; identity: Stats };
  bytes?: Buffer;
}
export interface InputSnapshot {
  input: LaunchInput;
  resources: Map<string, Resource>;
}
export class LaunchInputs {
  private owners = new Map<number, { generation: number; snapshot?: InputSnapshot }>();
  private grants = new Map<number, InputSnapshot>();
  constructor(private imageSize?: (bytes: Buffer) => { width: number; height: number }) {}
  async publish(owner: number, value: unknown, caller?: number): Promise<LaunchInput> {
    if (!value || typeof value !== 'object') throw Error(t('输入无效'));
    const result = value as Record<string, unknown>;
    if (result.type === 'text') {
      if (
        result.html !== undefined &&
        (typeof result.html !== 'string' || result.html.length > 2_000_000)
      )
        throw Error(t('富文本超过 2 MB'));
      const input = this.setText(owner, result.text as string, 'result');
      if (input.type === 'text') input.html = result.html as string | undefined;
      return input;
    }
    if (result.type === 'files' && caller !== undefined) {
      const snapshot = this.grants.get(caller);
      const tokens = result.resources;
      if (!snapshot || !Array.isArray(tokens) || !tokens.length || tokens.length > INPUT_FILE_LIMIT)
        throw Error(t('输入资源未授权或已失效'));
      const resources = new Map<string, Resource>();
      for (const token of new Set(tokens)) {
        const resource = typeof token === 'string' ? snapshot.resources.get(token) : undefined;
        if (!resource) throw Error(t('输入资源未授权或已失效'));
        if (!resource.descriptor.isDirectory) await this.read(caller, token);
        else if (resource.file) {
          const current = await stat(resource.file.path);
          if (
            !current.isDirectory() ||
            current.dev !== resource.file.identity.dev ||
            current.ino !== resource.file.identity.ino
          )
            throw Error(t('输入文件已变化，请重新拖入'));
        }
        const id = randomUUID();
        resources.set(id, { ...resource, descriptor: { ...resource.descriptor, id } });
      }
      if (this.grants.get(caller) !== snapshot) throw Error(t('输入资源已失效'));
      const input: LaunchInput = {
        id: randomUUID(),
        from: 'result',
        type: 'files',
        files: [...resources.values()].map((r) => r.descriptor),
      };
      this.owners.set(owner, {
        generation: (this.owners.get(owner)?.generation || 0) + 1,
        snapshot: { input, resources },
      });
      return input;
    }
    if (result.type !== 'image' && result.type !== 'files') throw Error(t('不支持的输入类型'));
    const input = await this.capture(owner, { ...result, from: 'paste' });
    input.from = 'result';
    return input;
  }
  async captureImage(owner: number, bytes: Buffer): Promise<LaunchInput> {
    const input = await this.capture(owner, {
      type: 'image',
      data: 'data:image/png;base64,' + bytes.toString('base64'),
      from: 'paste',
    });
    input.from = 'capture';
    return input;
  }
  async captureSelection(owner: number, value: SelectionContent): Promise<LaunchInput> {
    if (value.type === 'text') return this.setText(owner, value.text, 'selection');
    const input = await this.capture(owner, { ...value, from: 'paste' });
    input.from = 'selection';
    return input;
  }
  transfer(source: number, target: number, id: string): LaunchInput {
    const snapshot = this.get(source, id);
    this.owners.set(target, {
      generation: (this.owners.get(target)?.generation || 0) + 1,
      snapshot,
    });
    return snapshot.input;
  }
  setText(owner: number, text: string, from: InputSource): LaunchInput {
    if (typeof text !== 'string' || text.length > INPUT_TEXT_LIMIT)
      throw new Error(t('输入最多 50 万字符'));
    const previous = this.owners.get(owner);
    if (
      previous?.snapshot?.input.type === 'text' &&
      previous.snapshot.input.text === text &&
      previous.snapshot.input.from === from
    )
      return previous.snapshot.input;
    const input: LaunchInput = { id: randomUUID(), type: 'text', text, from };
    this.owners.set(owner, {
      generation: (previous?.generation || 0) + 1,
      snapshot: { input, resources: new Map() },
    });
    return input;
  }
  async capture(owner: number, value: unknown): Promise<LaunchInput> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(t('输入无效'));
    const v = value as Record<string, unknown>;
    if (v.from !== 'paste' && v.from !== 'drop') throw new Error(t('输入来源无效'));
    const generation = (this.owners.get(owner)?.generation || 0) + 1;
    this.owners.set(owner, { generation });
    const resources = new Map<string, Resource>();
    const base: { id: string; from: 'paste' | 'drop' } = { id: randomUUID(), from: v.from };
    let input: LaunchInput;
    if (v.type === 'files') {
      if (
        !Array.isArray(v.paths) ||
        !v.paths.length ||
        v.paths.length > INPUT_FILE_LIMIT ||
        v.paths.some((p) => typeof p !== 'string' || p.length > 32767 || !path.isAbsolute(p))
      )
        throw new Error(t('文件输入无效，最多 100 项'));
      let total = 0;
      const files: InputResource[] = [];
      for (const file of [...new Set(v.paths as string[])]) {
        const actual = await realpath(file),
          identity = await stat(actual);
        if (!identity.isFile() && !identity.isDirectory())
          throw new Error(t('仅支持普通文件和目录'));
        if (identity.isFile()) {
          total += identity.size;
          if (identity.size > INPUT_RESOURCE_LIMIT || total > INPUT_TOTAL_LIMIT)
            throw new Error(t('单个文件最多 20 MB，本次输入合计最多 64 MB'));
        }
        const descriptor: InputResource = {
          id: randomUUID(),
          name: path.basename(file),
          path: actual,
          size: identity.isDirectory() ? 0 : identity.size,
          isDirectory: identity.isDirectory(),
        };
        files.push(descriptor);
        resources.set(descriptor.id, { descriptor, file: { path: actual, identity } });
      }
      input = { ...base, type: 'files', files };
    } else if (v.type === 'image') {
      if (
        typeof v.data !== 'string' ||
        v.data.length > Math.ceil((INPUT_RESOURCE_LIMIT * 4) / 3) + 100 ||
        !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(v.data)
      )
        throw new Error(t('图片输入无效或超过 20 MB'));
      const bytes = Buffer.from(v.data.slice(v.data.indexOf(',') + 1), 'base64');
      if (!bytes.length || bytes.length > INPUT_RESOURCE_LIMIT || !this.imageSize)
        throw new Error(t('图片输入无效'));
      const { width, height } = this.imageSize(bytes);
      if (width < 1 || height < 1 || width * height > 36_000_000)
        throw new Error(t('图片无效或超过 3600 万像素'));
      const image: InputResource = {
        id: randomUUID(),
        name: 'image.png',
        size: bytes.length,
        isDirectory: false,
        mime: 'image/png',
      };
      resources.set(image.id, { descriptor: image, bytes });
      input = { ...base, type: 'image', image };
    } else throw new Error(t('不支持的输入类型'));
    if (this.owners.get(owner)?.generation !== generation)
      throw new Error(t('输入已变化，请重新选择'));
    this.owners.set(owner, { generation, snapshot: { input, resources } });
    return input;
  }
  get(owner: number, id: unknown): InputSnapshot {
    const snapshot = this.owners.get(owner)?.snapshot;
    if (!snapshot || typeof id !== 'string' || snapshot.input.id !== id)
      throw new Error(t('输入已变化，请重新选择功能'));
    return snapshot;
  }
  clear(owner: number) {
    const generation = (this.owners.get(owner)?.generation || 0) + 1;
    this.owners.set(owner, { generation });
  }
  forget(owner: number) {
    this.owners.delete(owner);
  }
  grant(caller: number, snapshot: InputSnapshot): LaunchInput {
    const resources = new Map<string, Resource>();
    const copy = (descriptor: InputResource) => {
      const id = randomUUID(),
        resource = snapshot.resources.get(descriptor.id)!;
      const next = { ...descriptor, id };
      resources.set(id, { ...resource, descriptor: next });
      return next;
    };
    const source = snapshot.input;
    const input: LaunchInput =
      source.type === 'files'
        ? { ...source, files: source.files.map(copy) }
        : source.type === 'image'
          ? { ...source, image: copy(source.image) }
          : { ...source };
    this.grants.set(caller, { input, resources });
    return input;
  }
  revoke(caller: number) {
    this.grants.delete(caller);
  }
  async read(caller: number, token: unknown): Promise<Uint8Array> {
    const snapshot = this.grants.get(caller);
    if (typeof token !== 'string' || !snapshot?.resources.has(token))
      throw new Error(t('输入资源未授权或已失效'));
    const bytes = await this.readResource(snapshot, token);
    if (this.grants.get(caller) !== snapshot) throw new Error(t('输入资源已失效'));
    return bytes;
  }
  async readResource(snapshot: InputSnapshot, token: string): Promise<Uint8Array> {
    const resource = snapshot.resources.get(token);
    if (!resource) throw new Error(t('输入资源已失效'));
    if (resource.descriptor.isDirectory) throw new Error(t('目录仅提供元信息，不能读取目录内容'));
    if (resource.bytes) return new Uint8Array(resource.bytes);
    const file = resource.file!;
    const handle = await open(file.path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0)).catch(
      () => {
        throw new Error(t('输入文件已变化或无法读取'));
      },
    );
    try {
      const same = (value: Stats) =>
        value.isFile() &&
        value.dev === file.identity.dev &&
        value.ino === file.identity.ino &&
        value.size === file.identity.size &&
        value.mtimeMs === file.identity.mtimeMs &&
        value.ctimeMs === file.identity.ctimeMs;
      if (!same(await handle.stat())) throw new Error(t('输入文件已变化，请重新拖入'));
      // Bound reads even if another process grows the file after the first stat.
      const bytes = Buffer.alloc(file.identity.size);
      let offset = 0;
      while (offset < bytes.length) {
        const result = await handle.read(bytes, offset, bytes.length - offset, offset);
        if (!result.bytesRead) break;
        offset += result.bytesRead;
      }
      if (offset !== bytes.length || !same(await handle.stat()))
        throw new Error(t('输入文件已变化，请重新拖入'));
      return new Uint8Array(bytes);
    } finally {
      await handle.close();
    }
  }
  close() {
    this.owners.clear();
    this.grants.clear();
  }
}
