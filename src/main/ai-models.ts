import { t } from '../shared/i18n';
import type {
  AIConfiguration,
  AIEvent,
  AIProvider,
  AIRequest,
  AIResult,
  AISettingsState,
} from '../shared/ai';
import type { HostSecrets } from './host-secrets';
import { providerUrl, readJson, type Fetcher } from './plugin-sdk/providers';
import { consumeAIStream, encodeAIRequest } from './ai-protocols';

interface Storage {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
}
const CONFIG = 'ai-models:v1';
export class AIModels {
  private persistent = new Map<string, boolean>();
  constructor(
    private store: Storage,
    private secrets: HostSecrets,
    private fetcher: Fetcher,
  ) {}
  private config(): AIConfiguration {
    return this.store.get(CONFIG, { providers: [], defaultModel: null });
  }
  state(): AISettingsState {
    const config = this.config();
    return {
      ...config,
      legacyAvailable: !!this.store.get<{ actions?: unknown[] }>(
        'plugin-data:org.nexlet.ai-actions',
        {},
      ).actions?.length,
      credentials: Object.fromEntries(
        config.providers.map((provider) => {
          let configured = false;
          try {
            configured = !!this.secrets.get('ai.' + provider.id);
          } catch {
            /* Locked OS vault requires re-entry. */
          }
          return [
            provider.id,
            { configured, persistent: this.persistent.get(provider.id) ?? true },
          ];
        }),
      ),
    };
  }
  importLegacy(): AISettingsState {
    const actions =
      this.store.get<{ actions?: { name?: string; model?: string; baseUrl?: string }[] }>(
        'plugin-data:org.nexlet.ai-actions',
        {},
      ).actions ?? [];
    const groups = new Map<string, Set<string>>();
    for (const action of actions) {
      if (!action.baseUrl || !action.model) continue;
      const url = providerUrl(action.baseUrl).href.replace(/\/$/, '');
      const models = groups.get(url) ?? new Set<string>();
      models.add(action.model);
      groups.set(url, models);
    }
    for (const [baseUrl, models] of groups) {
      const previous = this.config().providers.find(
        (p) => p.baseUrl === baseUrl && p.protocol === 'chat-completions',
      );
      this.save(
        previous
          ? { ...previous, models: [...new Set([...previous.models, ...models])] }
          : {
              id: crypto.randomUUID(),
              name: new URL(baseUrl).hostname,
              protocol: 'chat-completions',
              baseUrl,
              models: [...models],
              maxOutputTokens: 4096,
              capabilities: { images: false, tools: false },
            },
      );
    }
    return this.state();
  }
  save(value: AIProvider, apiKey?: string | null): AISettingsState {
    if (
      !value ||
      typeof value !== 'object' ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(value.id) ||
      typeof value.name !== 'string' ||
      !value.name.trim() ||
      value.name.length > 100
    )
      throw new Error(t('供应商名称或 ID 无效'));
    if (!['chat-completions', 'responses', 'anthropic'].includes(value.protocol))
      throw new Error(t('AI 协议无效'));
    if (
      !Array.isArray(value.models) ||
      value.models.length > 500 ||
      value.models.some((model) => typeof model !== 'string' || !model.trim() || model.length > 200)
    )
      throw new Error(t('模型 ID 无效'));
    if (
      !Number.isInteger(value.maxOutputTokens) ||
      value.maxOutputTokens < 1 ||
      value.maxOutputTokens > 200000
    )
      throw new Error(t('输出 Token 上限无效'));
    if (
      value.contextWindowTokens !== undefined &&
      (!Number.isInteger(value.contextWindowTokens) ||
        value.contextWindowTokens <= value.maxOutputTokens ||
        value.contextWindowTokens > 10000000)
    )
      throw new Error(t('上下文上限必须大于输出上限'));
    if (
      value.reasoningEffort !== undefined &&
      (value.protocol === 'anthropic' || !['low', 'medium', 'high'].includes(value.reasoningEffort))
    )
      throw new Error(t('推理参数与协议不匹配'));
    if (
      value.thinkingBudgetTokens !== undefined &&
      (value.protocol !== 'anthropic' ||
        !Number.isInteger(value.thinkingBudgetTokens) ||
        value.thinkingBudgetTokens < 1024 ||
        value.thinkingBudgetTokens >= value.maxOutputTokens)
    )
      throw new Error(t('思考预算须至少 1024，且小于输出上限'));
    if (
      value.temperature !== undefined &&
      (!Number.isFinite(value.temperature) ||
        value.temperature < 0 ||
        value.temperature > (value.protocol === 'anthropic' ? 1 : 2))
    )
      throw new Error(t('Temperature 无效'));
    const provider: AIProvider = {
      id: value.id,
      name: value.name.trim(),
      protocol: value.protocol,
      baseUrl: providerUrl(value.baseUrl).href.replace(/\/$/, ''),
      models: [...new Set(value.models.map((model) => model.trim()))],
      maxOutputTokens: value.maxOutputTokens,
      ...(value.contextWindowTokens === undefined
        ? {}
        : { contextWindowTokens: value.contextWindowTokens }),
      ...(value.reasoningEffort === undefined ? {} : { reasoningEffort: value.reasoningEffort }),
      ...(value.thinkingBudgetTokens === undefined
        ? {}
        : { thinkingBudgetTokens: value.thinkingBudgetTokens }),
      ...(value.temperature === undefined ? {} : { temperature: value.temperature }),
      capabilities: {
        images: value.capabilities?.images === true,
        tools: value.capabilities?.tools === true,
      },
    };
    const config = this.config(),
      old = config.providers.find((p) => p.id === provider.id);
    if (!old && config.providers.length >= 30) throw new Error(t('供应商最多 30 个'));
    if (
      apiKey !== undefined ||
      old?.baseUrl !== provider.baseUrl ||
      old?.protocol !== provider.protocol
    )
      this.persistent.set(
        provider.id,
        this.secrets.set('ai.' + provider.id, apiKey ?? null).persistent,
      );
    config.providers = [...config.providers.filter((p) => p.id !== provider.id), provider];
    if (
      config.defaultModel?.providerId === provider.id &&
      !provider.models.includes(config.defaultModel.model)
    )
      config.defaultModel = null;
    this.store.set(CONFIG, config);
    return this.state();
  }
  remove(id: string): AISettingsState {
    const config = this.config();
    if (!config.providers.some((p) => p.id === id)) throw new Error(t('供应商不存在'));
    config.providers = config.providers.filter((p) => p.id !== id);
    if (config.defaultModel?.providerId === id) config.defaultModel = null;
    this.secrets.set('ai.' + id, null);
    this.persistent.delete(id);
    this.store.set(CONFIG, config);
    return this.state();
  }
  setDefault(value: AIConfiguration['defaultModel']): AISettingsState {
    const config = this.config();
    if (
      value &&
      !config.providers.some((p) => p.id === value.providerId && p.models.includes(value.model))
    )
      throw new Error(t('默认模型不存在'));
    config.defaultModel = value ? { providerId: value.providerId, model: value.model } : null;
    this.store.set(CONFIG, config);
    return this.state();
  }
  private request(provider: AIProvider, route: string, signal: AbortSignal, body?: unknown) {
    const key = this.secrets.get('ai.' + provider.id);
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    };
    if (provider.protocol === 'anthropic') {
      headers['anthropic-version'] = '2023-06-01';
      if (key) headers['x-api-key'] = key;
    } else if (key) headers.authorization = `Bearer ${key}`;
    return this.fetcher(provider.baseUrl + route, {
      method: body ? 'POST' : 'GET',
      body: body ? JSON.stringify(body) : undefined,
      headers,
      signal,
      redirect: 'error',
      credentials: 'omit',
    });
  }
  async models(id: string, signal: AbortSignal): Promise<string[]> {
    const provider = this.config().providers.find((p) => p.id === id);
    if (!provider) throw new Error(t('供应商不存在'));
    const json = await readJson(await this.request(provider, '/models', signal), signal);
    if (!Array.isArray(json.data)) throw new Error(t('模型列表无效；可以手动填写模型 ID'));
    return json.data
      .map((value: unknown) => {
        const item = value as { id?: unknown };
        if (typeof item?.id !== 'string' || item.id.length > 200)
          throw new Error(t('模型 ID 无效'));
        return item.id;
      })
      .slice(0, 500);
  }
  async generate(
    request: AIRequest,
    signal: AbortSignal,
    emit: (event: AIEvent) => void,
  ): Promise<AIResult> {
    const config = this.config(),
      provider = config.providers.find(
        (p) => p.id === (request.providerId ?? config.defaultModel?.providerId),
      );
    const model =
      request.model ??
      (provider?.id === config.defaultModel?.providerId ? config.defaultModel?.model : undefined);
    if (!provider || !model || !provider.models.includes(model))
      throw new Error(t('请先在设置中选择共享 AI 模型'));
    if (
      !Array.isArray(request.messages) ||
      !request.messages.length ||
      request.messages.length > 200 ||
      Buffer.byteLength(JSON.stringify(request)) > 6 * 1024 * 1024
    )
      throw new Error(t('AI 消息无效或超过 6 MiB'));
    for (const message of request.messages) {
      if (!['user', 'assistant', 'system'].includes(message.role))
        throw new Error(t('消息角色无效'));
      if (typeof message.content === 'string') continue;
      if (!Array.isArray(message.content) || message.content.length > 20)
        throw new Error(t('消息内容无效'));
      for (const part of message.content) {
        if (part.type === 'text' && typeof part.text === 'string') continue;
        if (
          part.type !== 'image' ||
          !provider.capabilities.images ||
          message.role !== 'user' ||
          !['image/png', 'image/jpeg', 'image/webp'].includes(part.mediaType) ||
          typeof part.data !== 'string' ||
          !/^[A-Za-z0-9+/]*={0,2}$/.test(part.data)
        )
          throw new Error(t('模型不支持此图片输入'));
      }
    }
    if (request.tools?.length && !provider.capabilities.tools)
      throw new Error(t('模型未启用工具调用'));
    if (
      request.tools &&
      (!Array.isArray(request.tools) ||
        request.tools.length > 64 ||
        request.tools.some(
          (tool) =>
            !/^[a-zA-Z0-9_-]{1,64}$/.test(tool.name) ||
            !tool.parameters ||
            typeof tool.parameters !== 'object',
        ))
    )
      throw new Error(t('工具定义无效'));
    if (provider.contextWindowTokens !== undefined) {
      // UTF-8 bytes conservatively bound common text tokenizers. Image token accounting remains server-side.
      const textOnly = request.messages.map((message) => ({
        ...message,
        content:
          typeof message.content === 'string'
            ? message.content
            : message.content.filter((part) => part.type === 'text'),
      }));
      const estimate =
        Buffer.byteLength(JSON.stringify({ messages: textOnly, tools: request.tools })) +
        request.messages.length * 16;
      if (estimate + provider.maxOutputTokens > provider.contextWindowTokens)
        throw new Error(t('文本上下文估算超过配置上限，请缩短输入或调整上限'));
    }
    const body = encodeAIRequest(provider, model, request);
    const route =
      provider.protocol === 'responses'
        ? '/responses'
        : provider.protocol === 'anthropic'
          ? '/messages'
          : '/chat/completions';
    return consumeAIStream(
      provider.protocol,
      await this.request(provider, route, signal, body),
      signal,
      emit,
    );
  }
}
