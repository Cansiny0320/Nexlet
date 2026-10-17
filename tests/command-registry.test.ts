import { describe, it, expect } from 'vite-plus/test';
import { CommandRegistry } from '../src/main/command-registry';
import { BUILTIN_COMMANDS } from '../src/shared/types';
import { searchCommands } from '../src/shared/search';

function fixture() {
  const data = new Map<string, unknown>([
    ['pinned', ['tool:json']],
    ['recent', ['tool:json', 'tool:encoding']],
  ]);
  const store = {
    get: <T>(key: string, fallback: T): T => (data.get(key) ?? fallback) as T,
    set: (key: string, value: unknown) => {
      data.set(key, value);
    },
  };
  return new CommandRegistry(store);
}
describe('command customizations', () => {
  it('preserves legacy IDs and adds searchable aliases without changing source keywords', () => {
    const r = fixture();
    r.save(r.prepare({ action: 'patch', id: 'tool:json', patch: { aliases: ['结构化数据'] } }));
    expect(r.pinned()).toEqual(['tool:json']);
    expect(searchCommands(r.commands(BUILTIN_COMMANDS), 'jghsj')[0].id).toBe('tool:json');
    expect(BUILTIN_COMMANDS.find((c) => c.id === 'tool:json')!.keywords).not.toContain(
      '结构化数据',
    );
  });
  it('excludes disabled commands while keeping configuration for re-enable', () => {
    const r = fixture();
    r.save(
      r.prepare({
        action: 'patch',
        id: 'tool:json',
        patch: { disabled: true, aliases: ['我的格式化'] },
      }),
    );
    expect(r.commands(BUILTIN_COMMANDS).some((c) => c.id === 'tool:json')).toBe(false);
    expect(r.read().commands['tool:json'].aliases).toEqual(['我的格式化']);
    expect(() => r.assertEnabled('match:json')).toThrow('禁用');
  });
  it('rejects stale pinned reorders, retains exact membership, patches by ID', () => {
    const r = fixture(),
      rev = r.read().revision;
    r.save(r.prepare({ action: 'pin', id: 'tool:encoding' }));
    expect(() =>
      r.prepare({ action: 'reorder', ids: ['tool:json', 'tool:encoding'], revision: rev }),
    ).toThrow('其他窗口');
    expect(() =>
      r.prepare({ action: 'reorder', ids: ['tool:json'], revision: r.read().revision }),
    ).toThrow();
    r.save(
      r.prepare({
        action: 'reorder',
        ids: ['tool:encoding', 'tool:json'],
        revision: r.read().revision,
      }),
    );
    expect(r.pinned()).toEqual(['tool:encoding', 'tool:json']);
  });
  it('retains local entry ID when renaming or moving, removes only the selected entry', () => {
    const r = fixture();
    r.save(r.prepare({ action: 'localSave', name: '文档', path: '/tmp/example' }));
    const item = r.read().localEntries[0];
    r.save(r.prepare({ action: 'localSave', id: item.id, name: '新文档', path: '/tmp/changed' }));
    expect(r.read().localEntries).toEqual([{ id: item.id, name: '新文档', path: '/tmp/changed' }]);
    r.save(r.prepare({ action: 'localRemove', id: item.id }));
    expect(r.read().localEntries).toEqual([]);
  });
  it('resolves legacy duplicate shortcut IDs before unpinning or reordering', () => {
    const data = new Map<string, unknown>([['pinned', ['old-a', 'old-b', 'tool:json']]]);
    const r = new CommandRegistry(
      {
        get: <T>(key: string, fallback: T) => (data.get(key) ?? fallback) as T,
        set: (key, value) => {
          data.set(key, value);
        },
      },
      (ids) => [...new Set(ids.map((id) => (id.startsWith('old-') ? 'current' : id)))],
    );
    expect(r.pinned()).toEqual(['current', 'tool:json']);
    r.save(r.prepare({ action: 'pin', id: 'current' }));
    expect(r.pinned()).toEqual(['tool:json']);
  });
});
