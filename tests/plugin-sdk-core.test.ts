import { describe, expect, it } from 'vite-plus/test';
import { DatabaseSync } from 'node:sqlite';
import { PluginDatabase } from '../src/main/plugin-sdk/database';
import { PluginTasks } from '../src/main/plugin-sdk/tasks';
import { PluginScheduler } from '../src/main/plugin-sdk/scheduler';

describe('plugin document database', () => {
  it('queries Unicode prefixes literally and paginates without crossing plugin boundaries', () => {
    const sql = new DatabaseSync(':memory:'),
      db = new PluginDatabase(sql);
    try {
      for (const id of ['📁/a', '📁/b', '📁other', '中文/a', '𠮷/a', 'x%_/a', 'xyz/a'])
        db.put('a', { id, value: id });
      db.put('b', { id: '📁/other-plugin', value: null });
      expect(db.query('a', { prefix: '📁/', limit: 1 }).map((doc) => doc.id)).toEqual(['📁/a']);
      expect(db.query('a', { prefix: '📁/', after: '📁/a' }).map((doc) => doc.id)).toEqual([
        '📁/b',
      ]);
      for (const prefix of ['中文/', '𠮷/', 'x%_/'])
        expect(db.query('a', { prefix }).map((doc) => doc.id)).toEqual([prefix + 'a']);
      expect(db.query('a')).toHaveLength(7);
    } finally {
      sql.close();
    }
  });
  it('isolates plugins, detects stale revisions and rolls back an entire bulk write', () => {
    const sql = new DatabaseSync(':memory:'),
      db = new PluginDatabase(sql);
    const first = db.put('a', { id: 'note', value: { text: 'one' } });
    expect(db.get('b', 'note')).toBeNull();
    expect(() => db.put('a', { id: 'note', value: {}, rev: 'stale' })).toThrow(/conflict/);
    expect(() =>
      db.bulk('a', [
        { id: 'other', value: 2 },
        { id: 'note', value: 3 },
      ]),
    ).toThrow(/conflict/);
    expect(db.get('a', 'other')).toBeNull();
    const next = db.put('a', { id: 'note', rev: first.rev, value: { text: 'two' } });
    expect(next.rev).not.toBe(first.rev);
    expect(db.query('a', { prefix: 'no' })).toEqual([next]);
    expect(() => db.remove('a', 'note', first.rev)).toThrow(/conflict/);
    db.remove('a', 'note', next.rev);
    expect(db.get('a', 'note')).toBeNull();
    sql.close();
  });
  it('attaches binary data to revisions and removes it with the document', () => {
    const sql = new DatabaseSync(':memory:'),
      db = new PluginDatabase(sql);
    const doc = db.put('a', { id: 'd', value: null });
    const updated = db.putAttachment(
      'a',
      'd',
      doc.rev,
      'file',
      'text/plain',
      new Uint8Array([0, 255]),
    );
    expect(updated.rev).not.toBe(doc.rev);
    expect([...db.getAttachment('a', 'd', 'file')!.data]).toEqual([0, 255]);
    expect(db.getAttachment('b', 'd', 'file')).toBeNull();
    db.remove('a', 'd', updated.rev);
    expect(db.getAttachment('a', 'd', 'file')).toBeNull();
    sql.close();
  });
});

describe('persistent schedules', () => {
  it('skips disabled plugins, avoids duplicate concurrent runs and records failures', async () => {
    const values = new Map<string, unknown>();
    const store = {
      get: <T>(key: string, fallback: T): T => structuredClone(values.get(key) ?? fallback) as T,
      set: (key: string, value: unknown) => {
        values.set(key, structuredClone(value));
      },
    };
    let enabled = false,
      calls = 0,
      finish!: () => void;
    const scheduler = new PluginScheduler(
      store,
      () => enabled,
      async () => {
        calls++;
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        throw new Error('fixture error');
      },
    );
    scheduler.set('a', { id: 'once', method: 'run', at: 1 });
    await scheduler.tick(2);
    expect(calls).toBe(0);
    enabled = true;
    const pending = scheduler.tick(2);
    await scheduler.tick(3);
    expect(calls).toBe(1);
    finish();
    await pending;
    expect(scheduler.list('a')[0]).toMatchObject({ lastRun: 2, lastError: 'fixture error' });
    await scheduler.tick(4);
    expect(calls).toBe(1);
    scheduler.close();
    const restored = new PluginScheduler(
      store,
      () => true,
      async () => {
        calls++;
      },
    );
    expect(restored.list('a')[0].lastError).toBe('fixture error');
    restored.close();
  });
});

describe('plugin task ownership', () => {
  it('rejects duplicates, limits cancellation to the owner and rejects late results', async () => {
    const tasks = new PluginTasks();
    let resolve!: (value: number) => void;
    const pending = tasks.run(
      1,
      'job',
      1000,
      () =>
        new Promise<number>((r) => {
          resolve = r;
        }),
    );
    await expect(tasks.run(1, 'job', 1000, async () => 2)).rejects.toThrow(/重复/);
    expect(tasks.cancel(2, 'job')).toBe(false);
    expect(tasks.cancel(1, 'job')).toBe(true);
    resolve(42);
    await expect(pending).rejects.toThrow(/取消/);
    expect(tasks.size).toBe(0);
  });
  it('times out and closes all work owned by a session', async () => {
    const tasks = new PluginTasks();
    await expect(tasks.run(1, 'timeout', 5, () => new Promise(() => {}))).rejects.toThrow(/超时/);
    const pending = tasks.run(1, 'close', 1000, () => new Promise(() => {}));
    tasks.close(1);
    await expect(pending).rejects.toThrow(/取消/);
    expect(tasks.size).toBe(0);
  });
});
