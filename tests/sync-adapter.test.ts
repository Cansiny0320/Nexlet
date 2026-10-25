import { afterEach, expect, it } from 'vite-plus/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store } from '../src/main/store';
import { HostSecrets } from '../src/main/host-secrets';
import { AIModels } from '../src/main/ai-models';
import { StoreSyncAdapter } from '../src/main/sync-adapter';
import { SyncEngine } from '../src/main/sync-engine';
import { defaultCommandConfig } from '../src/shared/command-config';
import { SYNC_CATEGORIES } from '../src/shared/account-sync';
let store: Store | undefined;
let directory = '';
afterEach(() => {
  store?.close();
  if (directory) rmSync(directory, { recursive: true, force: true });
});
function fixture() {
  directory = mkdtempSync(path.join(tmpdir(), 'nexlet-sync-'));
  store = new Store(directory);
  const secrets = new HostSecrets(store, {
    isEncryptionAvailable: () => false,
    encryptString: () => {
      throw Error();
    },
    decryptString: () => {
      throw Error();
    },
  });
  const models = new AIModels(store, secrets, async () => {
    throw Error('Unexpected network');
  });
  const adapter = new StoreSyncAdapter(store, models, () => []);
  return { store, secrets, models, adapter, engine: new SyncEngine(store, 'alice', adapter) };
}
it('projects explicit fields and excludes keys, tokens, plugin databases and source files', () => {
  const { store, adapter, models, secrets } = fixture();
  models.save(
    {
      id: 'p',
      name: 'P',
      protocol: 'responses',
      baseUrl: 'https://example.invalid/v1',
      models: ['m'],
      maxOutputTokens: 100,
      capabilities: { images: false, tools: false },
    },
    'sensitive-key',
  );
  secrets.set('account-session', 'sensitive-token');
  store.set('plugin-data:private', { secret: 'private-database' });
  store.set('plugin-data:org.nexlet.ai-actions', {
    apiKey: 'private-api-key',
    actions: [
      {
        id: 'a',
        name: 'A',
        prompt: 'Hello',
        model: 'm',
        baseUrl: 'https://example.invalid/v1',
        apiKey: 'nested-key',
      },
    ],
  });
  store.addClip({
    id: 'file',
    hash: 'file',
    kind: 'files',
    text: 'C:\\private\\document.txt',
    files: ['C:\\private\\document.txt'],
    createdAt: 1,
    favorite: false,
  });
  const data = JSON.stringify(adapter.snapshot([...SYNC_CATEGORIES]));
  expect(data).toContain('document.txt');
  expect(data).toContain('Hello');
  expect(data).not.toMatch(/sensitive|private-database|private-api-key|nested-key|C:\\\\private/);
});
it('syncs only the declared note field and preserves unrelated plugin storage on deletion', () => {
  const { store, adapter } = fixture();
  store.set('plugin-data:org.nexlet.hello', { note: 'My note', private: 'excluded' });
  expect(adapter.snapshot(['notes'])).toEqual([{ kind: 'notes', id: 'default', value: 'My note' }]);
  adapter.apply({
    kind: 'notes',
    id: 'default',
    schema: 1,
    revision: 1,
    deleted: false,
    value: 'Received note',
  });
  expect(store.get('plugin-data:org.nexlet.hello', {})).toEqual({
    note: 'Received note',
    private: 'excluded',
  });
  adapter.apply({
    kind: 'notes',
    id: 'default',
    schema: 1,
    revision: 2,
    deleted: true,
    value: null,
  });
  expect(store.get('plugin-data:org.nexlet.hello', {})).toEqual({ private: 'excluded' });
});
it('keeps received shortcuts and executable paths pending, and never installs a plugin', () => {
  const { store, adapter, engine } = fixture();
  store.set('command-config', {
    ...defaultCommandConfig(),
    commands: { 'tool:json': { shortcut: 'Ctrl+J' } },
  });
  engine.categories(['commands', 'plugins']);
  adapter.apply({
    kind: 'commands',
    id: 'tool:json',
    schema: 1,
    revision: 1,
    deleted: false,
    value: {
      preference: { aliases: ['json'], shortcut: 'Ctrl+Q' },
      entry: null,
      platform: 'linux',
    },
  });
  expect(store.get('command-config', defaultCommandConfig()).commands['tool:json'].shortcut).toBe(
    'Ctrl+J',
  );
  expect(store.get('sync-device-mappings', {})).toHaveProperty('tool:json');
  adapter.apply({
    kind: 'plugins',
    id: 'other-device',
    schema: 1,
    revision: 2,
    deleted: false,
    value: [{ id: 'org.test.plugin', version: '1.0.0', enabled: true }],
  });
  expect(store.get('plugins', [])).toEqual([]);
  adapter.apply({
    kind: 'commands',
    id: 'local:entry',
    schema: 1,
    revision: 3,
    deleted: false,
    value: {
      preference: {},
      entry: { id: 'entry', name: 'Tool', path: '/tmp/tool' },
      platform: 'linux',
    },
  });
  expect(store.get('command-config', defaultCommandConfig()).localEntries).toEqual([]);
});
it('rolls back cursor and local writes when a remote page is invalid', () => {
  const { store, engine } = fixture();
  engine.categories(['snippets']);
  expect(() =>
    engine.pull({
      records: [
        {
          kind: 'snippets',
          id: 'good',
          schema: 1,
          revision: 1,
          deleted: false,
          value: { id: 'good', name: 'Good', group: '', body: 'Hello' },
        },
        {
          kind: 'snippets',
          id: 'bad',
          schema: 1,
          revision: 2,
          deleted: false,
          value: { id: 'bad', name: 'Bad', body: '{{unknown}}' },
        },
      ],
      cursor: 2,
      used: 2,
      quota: 100,
    }),
  ).toThrow();
  expect(engine.read().cursor).toBe(0);
  expect(store.get('productivity', { snippets: [] }).snippets).toEqual([]);
});
it('does not echo normalized remote data or revive a deleted clip from another category', () => {
  const { store, engine, adapter } = fixture();
  engine.categories(['commands']);
  engine.pull({
    records: [
      {
        kind: 'commands',
        id: 'tool:json',
        schema: 1,
        revision: 1,
        deleted: false,
        value: { preference: { aliases: ['json'] }, entry: null, platform: 'linux' },
      },
    ],
    cursor: 1,
    used: 1,
    quota: 100,
  });
  engine.capture();
  expect(engine.read().outbox).toEqual({});
  store.addClip({
    id: 'clip',
    kind: 'text',
    text: 'Favorite',
    hash: 'clip',
    createdAt: 1,
    favorite: true,
  });
  adapter.apply({
    kind: 'clipboardHistory',
    id: 'clip',
    schema: 1,
    revision: 2,
    deleted: true,
    value: null,
  });
  expect(store.clip('clip')?.favorite).toBe(true);
});
