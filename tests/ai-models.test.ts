import { describe, expect, it } from 'vite-plus/test';
import { AIModels } from '../src/main/ai-models';
import { HostSecrets } from '../src/main/host-secrets';
import { PluginSecrets } from '../src/main/plugin-secrets';
import type { AIProvider } from '../src/shared/ai';

const provider: AIProvider = {
  id: 'p',
  name: 'Test',
  protocol: 'responses',
  baseUrl: 'https://example.com/v1',
  models: ['m'],
  capabilities: { images: false, tools: false },
  maxOutputTokens: 1024,
};
function fixture(available = true) {
  const values = new Map<string, unknown>();
  const store = {
    get: <T>(key: string, fallback: T) => (values.get(key) ?? fallback) as T,
    set: (key: string, value: unknown) => {
      values.set(key, structuredClone(value));
    },
  };
  const encryption = {
    isEncryptionAvailable: () => available,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  };
  const secrets = new HostSecrets(store, encryption);
  const models = new AIModels(store, secrets, async () => {
    throw new Error('No network');
  });
  return { models, store, secrets, encryption };
}
describe('shared model settings and credentials', () => {
  it('rejects invalid reasoning budgets and conservatively bounds text context before network access', async () => {
    const { models } = fixture();
    expect(() => models.save({ ...provider, contextWindowTokens: 512 })).toThrow();
    expect(() =>
      models.save({ ...provider, protocol: 'anthropic', thinkingBudgetTokens: 1024 }),
    ).toThrow();
    models.save({ ...provider, contextWindowTokens: 2048, reasoningEffort: 'high' });
    models.setDefault({ providerId: 'p', model: 'm' });
    await expect(
      models.generate(
        { messages: [{ role: 'user', content: '中'.repeat(500) }] },
        AbortSignal.timeout(1000),
        () => {},
      ),
    ).rejects.toThrow('上下文');
  });
  it('imports legacy model definitions only after an explicit action and never copies keys', () => {
    const { models, store, secrets } = fixture();
    store.set('plugin-data:org.nexlet.ai-actions', {
      apiKey: 'old-secret',
      actions: [{ name: 'Old', model: 'm', baseUrl: 'https://old.example/v1' }],
    });
    expect(models.state().providers).toEqual([]);
    const imported = models.importLegacy();
    expect(imported.providers[0].models).toEqual(['m']);
    expect(secrets.get('ai.' + imported.providers[0].id)).toBeNull();
  });
  it('never exposes keys to settings or plugin namespaces', () => {
    const { models, secrets, store, encryption } = fixture();
    models.save(provider, 'key');
    expect(JSON.stringify(models.state())).not.toContain('key');
    expect(new PluginSecrets(store, encryption).get('credentials', 0, 'ai.p')).toBeNull();
    expect(secrets.get('ai.p')).toBe('key');
  });
  it('clears credentials when address or protocol changes', () => {
    const { models, secrets } = fixture();
    models.save(provider, 'key');
    models.save({ ...provider, name: 'Rename' });
    expect(secrets.get('ai.p')).toBe('key');
    models.save({ ...provider, baseUrl: 'https://elsewhere.example/v1' });
    expect(secrets.get('ai.p')).toBeNull();
    models.save(provider, 'key');
    models.save({ ...provider, protocol: 'anthropic' });
    expect(secrets.get('ai.p')).toBeNull();
  });
  it('keeps unavailable secure storage memory-only and reports it', () => {
    const { models, secrets, store } = fixture(false);
    models.save(provider, 'key');
    expect(models.state().credentials.p).toEqual({ configured: true, persistent: false });
    expect(secrets.get('ai.p')).toBe('key');
    expect(store.get('host:plugin-secrets:credentials', {})).toEqual({});
  });
  it('validates model selection, sizes and declared capabilities before network access', async () => {
    const { models } = fixture();
    models.save(provider);
    expect(() => models.setDefault({ providerId: 'p', model: 'unknown' })).toThrow();
    models.setDefault({ providerId: 'p', model: 'm' });
    await expect(
      models.generate(
        {
          messages: [
            { role: 'user', content: [{ type: 'image', data: 'YWJj', mediaType: 'image/png' }] },
          ],
        },
        AbortSignal.timeout(1000),
        () => {},
      ),
    ).rejects.toThrow('图片');
    await expect(
      models.generate(
        { messages: [{ role: 'user', content: 'x' }], tools: [{ name: 'f', parameters: {} }] },
        AbortSignal.timeout(1000),
        () => {},
      ),
    ).rejects.toThrow('工具');
    models.remove('p');
    expect(models.state().defaultModel).toBeNull();
  });
});
