import { t } from '../shared/i18n';
import type {
  AIContent,
  AIEvent,
  AIProtocol,
  AIProvider,
  AIRequest,
  AIResult,
  AIToolCall,
  AIUsage,
} from '../shared/ai';

type ObjectValue = Record<string, unknown>;
const obj = (value: unknown): ObjectValue =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as ObjectValue) : {};
const str = (value: unknown) => (typeof value === 'string' ? value : '');
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function content(protocol: AIProtocol, parts: string | AIContent[], role: string): unknown {
  if (typeof parts === 'string') return parts;
  return parts.map((part) => {
    if (part.type === 'text')
      return {
        type:
          protocol === 'responses' ? (role === 'assistant' ? 'output_text' : 'input_text') : 'text',
        text: part.text,
      };
    const url = `data:${part.mediaType};base64,${part.data}`;
    if (protocol === 'anthropic')
      return {
        type: 'image',
        source: { type: 'base64', media_type: part.mediaType, data: part.data },
      };
    if (protocol === 'responses') return { type: 'input_image', image_url: url };
    return { type: 'image_url', image_url: { url } };
  });
}

export function encodeAIRequest(
  provider: AIProvider,
  model: string,
  request: AIRequest,
): ObjectValue {
  const protocol = provider.protocol;
  const common = {
    model,
    stream: true,
    ...(provider.temperature === undefined ||
    provider.reasoningEffort ||
    provider.thinkingBudgetTokens
      ? {}
      : { temperature: provider.temperature }),
  };
  const messages = request.messages.map((message) => ({
    role: message.role,
    content: content(protocol, message.content, message.role),
  }));
  if (protocol === 'responses')
    return {
      ...common,
      store: false,
      input: messages,
      max_output_tokens: provider.maxOutputTokens,
      ...(provider.reasoningEffort ? { reasoning: { effort: provider.reasoningEffort } } : {}),
      ...(request.tools?.length
        ? { tools: request.tools.map((tool) => ({ type: 'function', ...tool })) }
        : {}),
    };
  if (protocol === 'anthropic')
    return {
      ...common,
      max_tokens: provider.maxOutputTokens,
      ...(provider.thinkingBudgetTokens
        ? { thinking: { type: 'enabled', budget_tokens: provider.thinkingBudgetTokens } }
        : {}),
      system: request.messages
        .filter((message) => message.role === 'system')
        .map((message) =>
          typeof message.content === 'string'
            ? message.content
            : message.content
                .filter((part) => part.type === 'text')
                .map((part) => part.text)
                .join('\n'),
        )
        .join('\n'),
      messages: messages.filter((message) => message.role !== 'system'),
      ...(request.tools?.length
        ? {
            tools: request.tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              input_schema: tool.parameters,
            })),
          }
        : {}),
    };
  return {
    ...common,
    messages,
    max_completion_tokens: provider.maxOutputTokens,
    ...(provider.reasoningEffort ? { reasoning_effort: provider.reasoningEffort } : {}),
    stream_options: { include_usage: true },
    ...(request.tools?.length
      ? { tools: request.tools.map((tool) => ({ type: 'function', function: tool })) }
      : {}),
  };
}

class StreamFailure extends Error {
  constructor(
    message: string,
    readonly reason: 'error' | 'refusal' | 'truncated',
  ) {
    super(message);
  }
}

/** All protocols share transport framing, but retain their own lifecycle and delta semantics. */
export async function consumeAIStream(
  protocol: AIProtocol,
  response: Response,
  signal: AbortSignal,
  emit: (event: AIEvent) => void,
): Promise<AIResult> {
  const calls = new Map<number, AIToolCall>();
  let text = '',
    usage: AIUsage | undefined,
    terminal = false,
    finish = '',
    buffer = '',
    total = 0;
  const deltaText = (delta: unknown) => {
    if (typeof delta === 'string' && delta) {
      text += delta;
      emit({ type: 'text', delta });
    }
  };
  const tool = (index: unknown, delta: Partial<AIToolCall>) => {
    if (!Number.isInteger(index) || Number(index) < 0 || Number(index) >= 128)
      throw new StreamFailure(t('工具调用序号无效'), 'error');
    const n = Number(index),
      call = calls.get(n) ?? { id: '', name: '', arguments: '' };
    for (const key of ['id', 'name', 'arguments'] as const) if (delta[key]) call[key] += delta[key];
    calls.set(n, call);
    emit({ type: 'tool', index: n, delta });
  };
  const count = (value: unknown) => {
    const u = obj(value);
    if (!Object.keys(u).length) return;
    usage = {
      inputTokens: Number(u.input_tokens ?? u.prompt_tokens ?? usage?.inputTokens ?? 0),
      outputTokens: Number(u.output_tokens ?? u.completion_tokens ?? usage?.outputTokens ?? 0),
    };
    if (!Number.isFinite(usage.inputTokens) || !Number.isFinite(usage.outputTokens))
      throw new StreamFailure(t('Token 用量无效'), 'error');
    emit({ type: 'usage', usage });
  };
  const checkFinish = (reason: string) => {
    if (['length', 'max_tokens', 'incomplete', 'pause_turn'].includes(reason))
      throw new StreamFailure(t('模型输出达到限制或尚未完成'), 'truncated');
    if (['content_filter', 'refusal', 'safety'].includes(reason))
      throw new StreamFailure(t('模型拒绝了本次请求'), 'refusal');
    if (reason) finish = reason;
  };
  const event = (block: string) => {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data) return;
    if (protocol === 'chat-completions' && data === '[DONE]') {
      terminal = true;
      return;
    }
    const e = obj(JSON.parse(data));
    if (e.error || e.type === 'error' || e.type === 'response.failed')
      throw new StreamFailure(t('AI 服务返回错误事件'), 'error');
    if (protocol === 'chat-completions') {
      if (!Array.isArray(e.choices))
        throw new StreamFailure(t('Chat Completions 事件格式无效'), 'error');
      const choice = obj(e.choices[0]),
        d = obj(choice.delta);
      if (d.refusal) throw new StreamFailure(t('模型拒绝了本次请求'), 'refusal');
      deltaText(d.content);
      for (const value of array(d.tool_calls)) {
        const c = obj(value),
          f = obj(c.function);
        tool(c.index, { id: str(c.id), name: str(f.name), arguments: str(f.arguments) });
      }
      checkFinish(str(choice.finish_reason));
      count(e.usage);
    } else if (protocol === 'responses') {
      switch (e.type) {
        case 'response.output_text.delta':
          deltaText(e.delta);
          break;
        case 'response.refusal.delta':
          throw new StreamFailure(t('模型拒绝了本次请求'), 'refusal');
        case 'response.output_item.added': {
          const item = obj(e.item);
          if (item.type === 'function_call')
            tool(e.output_index, {
              id: str(item.call_id),
              name: str(item.name),
              arguments: str(item.arguments),
            });
          break;
        }
        case 'response.function_call_arguments.delta':
          tool(e.output_index, { arguments: str(e.delta) });
          break;
        case 'response.incomplete':
          throw new StreamFailure(t('模型输出未完成'), 'truncated');
        case 'response.completed': {
          const result = obj(e.response);
          if (result.status !== 'completed')
            throw new StreamFailure(t('Responses 状态不是 completed'), 'truncated');
          count(result.usage);
          finish = calls.size ? 'tool_calls' : 'stop';
          terminal = true;
          break;
        }
      }
    } else {
      switch (e.type) {
        case 'message_start':
          count(obj(e.message).usage);
          break;
        case 'content_block_start': {
          const block = obj(e.content_block);
          if (block.type === 'tool_use')
            tool(e.index, { id: str(block.id), name: str(block.name) });
          else if (block.type === 'text') deltaText(block.text);
          break;
        }
        case 'content_block_delta': {
          const d = obj(e.delta);
          if (d.type === 'text_delta') deltaText(d.text);
          else if (d.type === 'input_json_delta') tool(e.index, { arguments: str(d.partial_json) });
          break;
        }
        case 'message_delta':
          checkFinish(str(obj(e.delta).stop_reason));
          count(e.usage);
          break;
        case 'message_stop':
          terminal = true;
          break;
      }
    }
  };
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const cancel = () => {
    void reader?.cancel(signal.reason).catch(() => {});
  };
  try {
    signal.throwIfAborted();
    if (!response.ok) throw new StreamFailure(`AI 请求失败：HTTP ${response.status}`, 'error');
    reader = response.body?.getReader();
    if (!reader) throw new StreamFailure(t('AI 没有返回流'), 'error');
    signal.addEventListener('abort', cancel, { once: true });
    const decoder = new TextDecoder('utf-8', { fatal: true });
    while (!terminal) {
      const chunk = await reader.read();
      signal.throwIfAborted();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > 8 * 1024 * 1024) throw new StreamFailure(t('AI 响应超过 8 MiB'), 'error');
      buffer = (buffer + decoder.decode(chunk.value, { stream: true })).replace(/\r\n/g, '\n');
      let end: number;
      while (!terminal && (end = buffer.indexOf('\n\n')) >= 0) {
        event(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
      }
    }
    if (!terminal || !finish) throw new StreamFailure(t('AI 在完成标记前中断'), 'truncated');
    if (!['stop', 'tool_calls', 'end_turn', 'tool_use', 'stop_sequence'].includes(finish))
      throw new StreamFailure(`未知结束原因：${finish}`, 'error');
    const toolCalls = [...calls].sort(([a], [b]) => a - b).map(([, value]) => value);
    for (const call of toolCalls) {
      if (!call.id || !call.name) throw new StreamFailure(t('工具调用缺少标识'), 'error');
      JSON.parse(call.arguments || '{}');
    }
    emit({ type: 'complete', reason: toolCalls.length ? 'tool-calls' : 'stop' });
    return { text, toolCalls, ...(usage ? { usage } : {}) };
  } catch (error) {
    emit({
      type: 'failure',
      reason: signal.aborted
        ? 'cancelled'
        : error instanceof StreamFailure
          ? error.reason
          : 'error',
      message: signal.aborted
        ? t('请求已取消或超时')
        : error instanceof Error
          ? error.message
          : t('AI 请求失败'),
    });
    throw error;
  } finally {
    signal.removeEventListener('abort', cancel);
    await reader?.cancel().catch(() => {});
    reader?.releaseLock();
  }
}
