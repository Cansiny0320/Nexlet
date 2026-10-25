import { t } from '../shared/i18n';
import { readFile, stat } from 'node:fs/promises';
import type { ClipItem } from '../shared/types';
import type { CapabilityProviders } from './capability-providers';

/** Clipboard indexing uses the same explicit provider selection as screenshot OCR. */
export class OcrIndexRunner {
  constructor(private providers: CapabilityProviders) {}
  async available() {
    const state = this.providers.state();
    const provider = state.providers.find(
      (p) => p.id === state.defaults.ocr && p.capability === 'ocr',
    );
    if (!provider) throw new Error(t('请先安装 OCR 插件，并在设置中选择 OCR 提供商'));
    return provider;
  }
  async recognize(
    item: ClipItem,
    signal: AbortSignal,
    progress: (value: number) => void,
  ): Promise<string> {
    signal.throwIfAborted();
    await this.available();
    if (!item.imagePath) throw new Error(t('图片不存在'));
    const info = await stat(item.imagePath);
    if (!info.isFile() || info.size > 20 * 1024 * 1024)
      throw new Error(t('图片不存在或超过 20 MiB'));
    const image = new Uint8Array(await readFile(item.imagePath));
    return (await this.providers.run({ capability: 'ocr', image }, signal, progress)).text;
  }
}
