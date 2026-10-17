import { expect, it } from 'vite-plus/test';
import { defaultCommandConfig } from '../src/shared/command-config';
import { migrateCommandConfig, migrateCommandIds } from '../src/main/command-migrations';
import { PanelConfigStore } from '../src/main/panel-config';
import type { PanelConfig } from '../src/shared/super-panel';
it('preserves shortcuts, disabled state and aliases while retaining old settings for rollback', () => {
  const old = defaultCommandConfig();
  old.commands['tool:ocr'] = { shortcut: 'Alt+O', disabled: true, aliases: ['read'] };
  old.pinned = ['tool:ocr', 'tool:json'];
  const next = migrateCommandConfig(old);
  expect(next.commands['plugin:org.nexlet.ocr:recognize']).toEqual(old.commands['tool:ocr']);
  expect(next.commands['tool:ocr']).toEqual(old.commands['tool:ocr']);
  expect(next.pinned).toEqual(['plugin:org.nexlet.ocr:recognize', 'tool:json']);
  expect(migrateCommandConfig(next)).toBe(next);
  next.commands['plugin:org.nexlet.ocr:recognize'].shortcut = 'Alt+P';
  expect(migrateCommandConfig(next).commands['plugin:org.nexlet.ocr:recognize'].shortcut).toBe(
    'Alt+P',
  );
  expect(migrateCommandIds(['capture:ocr', 'plugin:org.nexlet.ocr:capture', 'toString'])).toEqual([
    'plugin:org.nexlet.ocr:capture',
    'toString',
  ]);
  next.commands['plugin:org.nexlet.ocr:recognize'].aliases!.push('independent');
  expect(old.commands['tool:ocr'].aliases).toEqual(['read']);
});
it('migrates direct and folder panel entries once while preserving their arrangement', () => {
  const saved: PanelConfig = {
    version: 1,
    revision: 3,
    enabled: true,
    mouse: 'right',
    holdMs: 200,
    shortcut: '',
    excludedApps: [],
    items: [
      { kind: 'command', id: 'a', commandId: 'tool:ocr' },
      {
        kind: 'folder',
        id: 'b',
        name: 'Tools',
        children: [{ kind: 'command', id: 'c', commandId: 'capture:ocr-copy' }],
      },
    ],
  };
  const values = new Map<string, unknown>([['panel-config', saved]]);
  const panel = new PanelConfigStore(
    {
      get: <T>(key: string, fallback: T) => structuredClone(values.get(key) ?? fallback) as T,
      set: (key, value) => {
        values.set(key, value);
      },
    },
    () => [],
  );
  const next = panel.read();
  expect(next.revision).toBe(4);
  expect(next.items[0]).toEqual({
    kind: 'command',
    id: 'a',
    commandId: 'plugin:org.nexlet.ocr:recognize',
  });
  expect(next.items[1]).toEqual({
    kind: 'folder',
    id: 'b',
    name: 'Tools',
    children: [{ kind: 'command', id: 'c', commandId: 'plugin:org.nexlet.ocr:capture-copy' }],
  });
  expect(panel.read()).toEqual(next);
});
