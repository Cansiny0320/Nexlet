import { t } from '../shared/i18n';
import Ajv from 'ajv';
import type {
  Capability,
  CapabilityDefinition,
  CapabilityRequest,
  CapabilityState,
  OcrResult,
  TranslationResult,
} from '../shared/capability-providers';
import type { PluginRecord } from '../shared/types';
interface Storage {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
}
export type CapabilityRunner = (
  record: PluginRecord,
  definition: CapabilityDefinition,
  request: CapabilityRequest,
  config: Record<string, unknown>,
  signal: AbortSignal,
  progress: (value: number) => void,
) => Promise<unknown>;
const ajv = new Ajv({ strict: false, validateFormats: false });
export class CapabilityProviders {
  private running = new Map<string, Set<AbortController>>();
  constructor(
    private store: Storage,
    private records: () => PluginRecord[],
    private invoke: CapabilityRunner,
  ) {}
  state(): CapabilityState {
    return {
      providers: this.records()
        .filter((record) => record.enabled)
        .flatMap((record) =>
          (record.manifest.providers ?? []).map(({ entry: _entry, ...definition }) => ({
            ...definition,
            id: `${record.manifest.id}:${definition.id}`,
            pluginId: record.manifest.id,
            version: record.manifest.version,
          })),
        ),
      defaults: this.store.get('capability-defaults:v1', {}),
    };
  }
  settings() {
    const state = this.state();
    return {
      ...state,
      configurations: Object.fromEntries(
        state.providers.map((p) => [
          p.id,
          this.store.get<Record<string, unknown>>('capability-config:' + p.id, {}),
        ]),
      ),
    };
  }
  private find(id: string) {
    for (const record of this.records().filter((record) => record.enabled)) {
      const definition = record.manifest.providers?.find(
        (provider) => `${record.manifest.id}:${provider.id}` === id,
      );
      if (definition) return { record, definition };
    }
    throw new Error(t('提供商不可用，请安装、启用插件或在设置中重新选择'));
  }
  setDefault(capability: Capability, id: string | null): CapabilityState {
    if (!['ocr', 'translation'].includes(capability)) throw new Error(t('能力类型无效'));
    if (id && this.find(id).definition.capability !== capability)
      throw new Error(t('提供商类型不匹配'));
    const defaults = this.state().defaults;
    if (id) defaults[capability] = id;
    else delete defaults[capability];
    this.store.set('capability-defaults:v1', defaults);
    return this.state();
  }
  configure(id: string, value: Record<string, unknown>): CapabilityState {
    const { definition } = this.find(id);
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      JSON.stringify(value).length > 32768
    )
      throw new Error(t('提供商配置无效'));
    if (
      !ajv.compile(definition.configSchema ?? { type: 'object', additionalProperties: false })(
        value,
      )
    )
      throw new Error(t('提供商配置不符合 schema'));
    this.store.set('capability-config:' + id, value);
    return this.state();
  }
  stop(plugin: string) {
    for (const controller of this.running.get(plugin) ?? [])
      controller.abort(new Error(t('提供商已停用或更新')));
    this.running.delete(plugin);
  }
  async run(
    request: CapabilityRequest,
    signal: AbortSignal,
    progress: (value: number) => void = () => {},
  ): Promise<OcrResult | TranslationResult> {
    signal.throwIfAborted();
    if (!['ocr', 'translation'].includes(request.capability)) throw new Error(t('能力类型无效'));
    if (
      request.capability === 'ocr' &&
      (!(request.image instanceof Uint8Array) ||
        !request.image.byteLength ||
        request.image.byteLength > 20 * 1024 * 1024)
    )
      throw new Error(t('图片无效或超过 20 MiB'));
    if (
      request.capability === 'translation' &&
      (typeof request.text !== 'string' ||
        !request.text.trim() ||
        request.text.length > 100000 ||
        typeof request.targetLanguage !== 'string' ||
        !/^[\w-]{1,32}$/.test(request.targetLanguage) ||
        (request.sourceLanguage !== undefined && !/^[\w-]{1,32}$/.test(request.sourceLanguage)))
    )
      throw new Error(t('翻译文本或语言无效'));
    const id = request.providerId ?? this.state().defaults[request.capability];
    if (!id) throw new Error(t('请先在设置中选择 OCR／翻译提供商'));
    const { record, definition } = this.find(id);
    if (definition.capability !== request.capability) throw new Error(t('提供商类型不匹配'));
    const controller = new AbortController(),
      combined = AbortSignal.any([signal, controller.signal, AbortSignal.timeout(120000)]);
    let active = this.running.get(record.manifest.id);
    if (!active) {
      active = new Set();
      this.running.set(record.manifest.id, active);
    }
    if (active.size >= 3) throw new Error(t('提供商最多同时处理 3 个请求'));
    active.add(controller);
    const version = record.manifest.version,
      directory = record.directory;
    let abort = () => {};
    try {
      const stopped = new Promise<never>((_resolve, reject) => {
        abort = () => reject(combined.reason);
        combined.addEventListener('abort', abort, { once: true });
        if (combined.aborted) abort();
      });
      const output = await Promise.race([
        this.invoke(
          record,
          definition,
          request,
          this.store.get('capability-config:' + id, {}),
          combined,
          (value) => {
            if (!combined.aborted && Number.isFinite(value))
              progress(Math.min(1, Math.max(0, value)));
          },
        ),
        stopped,
      ]);
      combined.throwIfAborted();
      const current = this.find(id).record;
      if (current.manifest.version !== version || current.directory !== directory)
        throw new Error(t('提供商已更新，请重试'));
      if (!output || typeof output !== 'object' || Array.isArray(output))
        throw new Error(t('提供商结果无效'));
      const result = output as OcrResult & TranslationResult;
      if (typeof result.text !== 'string' || result.text.length > 500000)
        throw new Error(t('提供商文本无效或过大'));
      for (const language of [result.language, result.detectedLanguage])
        if (language !== undefined && (typeof language !== 'string' || language.length > 32))
          throw new Error(t('提供商语言无效'));
      if (request.capability === 'translation')
        return {
          text: result.text,
          ...(result.detectedLanguage ? { detectedLanguage: result.detectedLanguage } : {}),
        };
      if (
        result.blocks !== undefined &&
        (!Array.isArray(result.blocks) ||
          result.blocks.length > 20000 ||
          result.blocks.some(
            (block) =>
              !block ||
              typeof block.text !== 'string' ||
              block.text.length > 10000 ||
              !Array.isArray(block.points) ||
              block.points.length > 16 ||
              block.points.some(
                (point) => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y),
              ) ||
              (block.confidence !== undefined &&
                (!Number.isFinite(block.confidence) ||
                  block.confidence < 0 ||
                  block.confidence > 1)),
          ))
      )
        throw new Error(t('OCR 文字块坐标或置信度无效'));
      return {
        text: result.text,
        ...(result.language ? { language: result.language } : {}),
        ...(result.blocks
          ? {
              blocks: result.blocks.map((block) => ({
                text: block.text,
                points: block.points.map(({ x, y }) => ({ x, y })),
                ...(block.confidence === undefined ? {} : { confidence: block.confidence }),
              })),
            }
          : {}),
      };
    } finally {
      combined.removeEventListener('abort', abort);
      active.delete(controller);
      if (!active.size && this.running.get(record.manifest.id) === active)
        this.running.delete(record.manifest.id);
    }
  }
}
