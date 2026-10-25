import { describe, it, expect } from 'vite-plus/test';
import { CapabilityProviders } from '../src/main/capability-providers';
import type { PluginRecord } from '../src/shared/types';

function fixture() {
  const records: PluginRecord[] = [
    {
      enabled: true,
      directory: '/plugin',
      development: true,
      installedAt: 1,
      manifest: {
        id: 'org.test.ocr',
        name: 'Test',
        version: '1.0.0',
        apiVersion: 1,
        main: 'index.html',
        description: '',
        permissions: [],
        features: [],
        providers: [
          {
            id: 'local',
            name: 'Offline',
            capability: 'ocr',
            locality: 'local',
            languages: ['en'],
            entry: 'provider.html',
          },
        ],
      },
    },
  ];
  const values = new Map();
  let resolve: (v: unknown) => void = () => {};
  let signal: AbortSignal | undefined;
  const registry = new CapabilityProviders(
    {
      get: (key, fallback) => values.get(key) ?? fallback,
      set: (key, value) => {
        values.set(key, value);
      },
    },
    () => records,
    async (_record, _definition, _request, _config, s) => {
      signal = s;
      return new Promise((r) => {
        resolve = r;
      });
    },
  );
  registry.setDefault('ocr', 'org.test.ocr:local');
  return { records, registry, complete: (v: unknown) => resolve(v), signal: () => signal };
}
describe('capability provider lifecycle', () => {
  it('validates result blocks and delivers the selected provider result', async () => {
    const f = fixture();
    const pending = f.registry.run(
      { capability: 'ocr', image: new Uint8Array([1]) },
      AbortSignal.timeout(1000),
    );
    f.complete({
      text: 'hello',
      blocks: [{ text: 'hello', confidence: 0.9, points: [{ x: 1, y: 2 }] }],
    });
    expect(await pending).toMatchObject({ text: 'hello', blocks: [{ confidence: 0.9 }] });
  });
  it('aborts disabled/updated providers and discards late responses', async () => {
    const f = fixture();
    const pending = f.registry.run(
      { capability: 'ocr', image: new Uint8Array([1]) },
      AbortSignal.timeout(1000),
    );
    f.records[0].enabled = false;
    f.registry.stop('org.test.ocr');
    expect(f.signal()?.aborted).toBe(true);
    f.complete({ text: 'late' });
    await expect(pending).rejects.toThrow();
  });
  it('does not silently replace a missing local default with a cloud provider', async () => {
    const f = fixture();
    f.records[0].enabled = false;
    await expect(
      f.registry.run({ capability: 'ocr', image: new Uint8Array([1]) }, AbortSignal.timeout(1000)),
    ).rejects.toThrow('提供商');
  });
  it('rejects excessive input, invalid configuration and malformed results', async () => {
    const f = fixture();
    await expect(
      f.registry.run(
        { capability: 'ocr', image: new Uint8Array(21 * 1024 * 1024) },
        AbortSignal.timeout(1000),
      ),
    ).rejects.toThrow();
    expect(() => f.registry.configure('org.test.ocr:local', { key: 'unexpected' })).toThrow();
    const pending = f.registry.run(
      { capability: 'ocr', image: new Uint8Array([1]) },
      AbortSignal.timeout(1000),
    );
    f.complete({ text: 'x', blocks: [{ text: 'x', points: [{ x: Infinity, y: 1 }] }] });
    await expect(pending).rejects.toThrow();
  });
});
