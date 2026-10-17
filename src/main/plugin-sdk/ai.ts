import { t } from '../../shared/i18n';
import { object, string, type SdkContext } from './context';
import { PluginProviders, readJson } from './providers';
import type { PluginTasks } from './tasks';

/** Decode SSE across arbitrary UTF-8/chunk boundaries. A missing DONE is a truncated response. */
export async function consumeChatStream(
  response: Response,
  signal: AbortSignal,
  emit: (chunk: Record<string, unknown>) => void,
): Promise<{ content: string; toolCalls: unknown[] }> {
  if (!response.ok) throw new Error(t('AI 请求失败：HTTP {{v0}}', { v0: response.status }));
  const reader = response.body?.getReader();
  if (!reader) throw new Error(t('AI 没有返回流'));
  const decoder = new TextDecoder();
  let buffer = '',
    total = 0,
    done = false,
    content = '';
  const calls = new Map<
    number,
    { id: string; type: string; function: { name: string; arguments: string } }
  >();
  const event = (block: string) => {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data) return;
    if (data === '[DONE]') {
      done = true;
      return;
    }
    const chunk = object(JSON.parse(data));
    if (chunk.error) throw new Error(t('AI 返回错误事件'));
    if (!Array.isArray(chunk.choices)) throw new Error(t('AI 流格式无效'));
    const delta = chunk.choices[0]?.delta;
    if (delta?.content) content += delta.content;
    for (const tool of delta?.tool_calls ?? []) {
      if (!Number.isInteger(tool.index) || tool.index < 0 || tool.index > 100)
        throw new Error(t('AI 工具调用索引无效'));
      const call = calls.get(tool.index) ?? {
        id: '',
        type: 'function',
        function: { name: '', arguments: '' },
      };
      if (tool.id) call.id += tool.id;
      if (tool.function?.name) call.function.name += tool.function.name;
      if (tool.function?.arguments) call.function.arguments += tool.function.arguments;
      calls.set(tool.index, call);
    }
    emit(chunk);
  };
  try {
    for (;;) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > 8 * 1024 * 1024) throw new Error(t('AI 输出超过 8 MB'));
      buffer += decoder.decode(chunk.value, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');
      let end: number;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        event(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        if (done) break;
      }
      if (done) break;
    }
    if (!done) throw new Error(t('AI 流在完成标记前中断'));
    signal.throwIfAborted();
    return {
      content,
      toolCalls: [...calls.entries()].sort(([a], [b]) => a - b).map(([, value]) => value),
    };
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export class PluginAI {
  constructor(
    private providers: PluginProviders,
    private tasks: PluginTasks,
  ) {}
  async invoke(context: SdkContext, method: string, value: unknown): Promise<unknown> {
    context.require('ai');
    if (method === 'ai.configure')
      return this.providers.configure(context.plugin, context.contents.id, 'ai', value);
    if (method === 'ai.status') return this.providers.status(context.plugin, 'ai');
    const args = object(value),
      id = string(args.id, 100);
    return this.tasks.run(
      context.contents.id,
      id,
      Number(args.timeoutMs ?? 120000),
      async (signal) => {
        if (method === 'ai.models') {
          const result = await readJson(
            await this.providers.request(
              context.plugin,
              context.contents.id,
              'ai',
              '/models',
              signal,
            ),
            signal,
          );
          if (
            !Array.isArray(result.data) ||
            result.data.some((item) => !item || typeof item.id !== 'string')
          )
            throw new Error(t('模型列表格式无效'));
          return result.data;
        }
        if (method === 'ai.chat') {
          const request = object(args.request);
          string(request.model, 200);
          if (!Array.isArray(request.messages) || !request.messages.length)
            throw new Error(t('AI messages 无效'));
          const stream = args.stream === true,
            response = await this.providers.request(
              context.plugin,
              context.contents.id,
              'ai',
              '/chat/completions',
              signal,
              { ...request, stream },
            );
          if (stream)
            return consumeChatStream(response, signal, (chunk) =>
              context.emit('ai.chunk', { id, chunk }),
            );
          const result = await readJson(response, signal);
          if (
            !Array.isArray(result.choices) ||
            !result.choices.length ||
            !result.choices[0]?.message
          )
            throw new Error(t('AI completion 格式无效'));
          return result;
        }
        throw new Error(t('不支持的 AI API'));
      },
    );
  }
}
