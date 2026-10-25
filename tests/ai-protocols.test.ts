import { describe, it, expect } from 'vite-plus/test';
import { consumeAIStream, encodeAIRequest } from '../src/main/ai-protocols';
import type { AIEvent, AIProtocol, AIProvider } from '../src/shared/ai';

const provider = (protocol: AIProtocol): AIProvider => ({
  id: 'p',
  name: 'P',
  baseUrl: 'https://example.com/v1',
  protocol,
  models: ['m'],
  capabilities: { images: true, tools: true },
  maxOutputTokens: 1000,
});
function response(events: unknown[], end = false) {
  const bytes = new TextEncoder().encode(
    events.map((e) => `data: ${JSON.stringify(e)}\r\n\r\n`).join('') +
      (end ? 'data: [DONE]\r\n\r\n' : ''),
  );
  return new Response(
    new ReadableStream({
      start(c) {
        for (const byte of bytes) c.enqueue(new Uint8Array([byte]));
        c.close();
      },
    }),
  );
}
describe('shared AI protocol adapters', () => {
  it('encodes protocol-specific opt-in reasoning and omits incompatible temperature', () => {
    const request = { messages: [{ role: 'user' as const, content: 'hello' }] };
    const responses = encodeAIRequest(
      { ...provider('responses'), reasoningEffort: 'high', temperature: 0.3 },
      'm',
      request,
    );
    expect(responses).toMatchObject({ reasoning: { effort: 'high' } });
    expect(responses).not.toHaveProperty('temperature');
    expect(
      encodeAIRequest({ ...provider('chat-completions'), reasoningEffort: 'low' }, 'm', request),
    ).toHaveProperty('reasoning_effort', 'low');
    const anthropic = encodeAIRequest(
      {
        ...provider('anthropic'),
        maxOutputTokens: 4096,
        thinkingBudgetTokens: 1024,
        temperature: 0.3,
      },
      'm',
      request,
    );
    expect(anthropic).toHaveProperty('thinking', { type: 'enabled', budget_tokens: 1024 });
    expect(anthropic).not.toHaveProperty('temperature');
  });
  it('maps images and system instructions without retaining Responses conversations', () => {
    const request = {
      messages: [
        { role: 'system' as const, content: 'Be brief' },
        {
          role: 'user' as const,
          content: [{ type: 'image' as const, data: 'YWJj', mediaType: 'image/png' as const }],
        },
      ],
    };
    expect(encodeAIRequest(provider('responses'), 'm', request)).toMatchObject({
      store: false,
      input: [
        { role: 'system', content: 'Be brief' },
        {
          role: 'user',
          content: [{ type: 'input_image', image_url: 'data:image/png;base64,YWJj' }],
        },
      ],
    });
    expect(encodeAIRequest(provider('anthropic'), 'm', request)).toMatchObject({
      system: 'Be brief',
      messages: [
        { role: 'user', content: [{ type: 'image', source: { type: 'base64', data: 'YWJj' } }] },
      ],
    });
  });
  it('decodes split UTF-8, tool arguments and usage for chat completions', async () => {
    const events: AIEvent[] = [];
    const result = await consumeAIStream(
      'chat-completions',
      response(
        [
          {
            choices: [
              {
                delta: {
                  content: '你好',
                  tool_calls: [{ index: 0, id: 'a', function: { name: 'f', arguments: '{' } }],
                },
              },
            ],
          },
          {
            choices: [
              {
                delta: { tool_calls: [{ index: 0, function: { arguments: '}' } }] },
                finish_reason: 'tool_calls',
              },
            ],
          },
          { choices: [], usage: { prompt_tokens: 4, completion_tokens: 3 } },
        ],
        true,
      ),
      AbortSignal.timeout(5000),
      (e) => events.push(e),
    );
    expect(result).toEqual({
      text: '你好',
      toolCalls: [{ id: 'a', name: 'f', arguments: '{}' }],
      usage: { inputTokens: 4, outputTokens: 3 },
    });
    expect(events.at(-1)).toEqual({ type: 'complete', reason: 'tool-calls' });
  });
  it('decodes Responses and Anthropic typed lifecycle events', async () => {
    const responses = await consumeAIStream(
      'responses',
      response([
        { type: 'response.output_text.delta', delta: 'ok' },
        {
          type: 'response.output_item.added',
          output_index: 0,
          item: { type: 'function_call', call_id: 'x', name: 'sum', arguments: '' },
        },
        { type: 'response.function_call_arguments.delta', output_index: 0, delta: '{}' },
        {
          type: 'response.completed',
          response: { status: 'completed', usage: { input_tokens: 2, output_tokens: 1 } },
        },
      ]),
      AbortSignal.timeout(5000),
      () => {},
    );
    expect(responses.toolCalls).toEqual([{ id: 'x', name: 'sum', arguments: '{}' }]);
    const anthropic = await consumeAIStream(
      'anthropic',
      response([
        { type: 'message_start', message: { usage: { input_tokens: 2, output_tokens: 0 } } },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '好的' } },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
        { type: 'message_stop' },
      ]),
      AbortSignal.timeout(5000),
      () => {},
    );
    expect(anthropic).toMatchObject({ text: '好的', usage: { inputTokens: 2, outputTokens: 3 } });
  });
  it.each([
    ['chat-completions', [{ choices: [{ delta: { content: 'partial' } }] }], false],
    ['chat-completions', [{ choices: [{ delta: {}, finish_reason: 'length' }] }], true],
    [
      'chat-completions',
      [{ choices: [{ delta: { refusal: 'no' }, finish_reason: 'stop' }] }],
      true,
    ],
    ['responses', [{ type: 'response.incomplete', response: { status: 'incomplete' } }], false],
    [
      'anthropic',
      [{ type: 'message_delta', delta: { stop_reason: 'max_tokens' } }, { type: 'message_stop' }],
      false,
    ],
  ] as [AIProtocol, unknown[], boolean][])(
    'does not complete interrupted/refused %s output',
    async (protocol, items, done) => {
      const events: AIEvent[] = [];
      await expect(
        consumeAIStream(protocol, response(items, done), AbortSignal.timeout(5000), (e) =>
          events.push(e),
        ),
      ).rejects.toThrow();
      expect(events.some((e) => e.type === 'complete')).toBe(false);
      expect(events.at(-1)?.type).toBe('failure');
    },
  );
  it('cancels a silent reader promptly', async () => {
    let cancelled = false;
    const res = new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
    );
    await expect(
      consumeAIStream('responses', res, AbortSignal.timeout(20), () => {}),
    ).rejects.toThrow();
    expect(cancelled).toBe(true);
  });
});
