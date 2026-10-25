import { describe, it, expect } from 'vite-plus/test';
import { MarketTasks } from '../src/main/market-tasks';
import type { PluginBundle } from '../src/main/plugin-bundle';
const bundle: PluginBundle = {
  manifest: {
    id: 'org.test.plugin',
    name: 'Test',
    version: '2.0.0',
    apiVersion: 1,
    main: 'index.html',
    description: '',
    permissions: ['ai'],
    features: [],
  },
  files: new Map(),
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
describe('market installation jobs', () => {
  it('requires a separate install action after package download and permission inspection', async () => {
    let installed = 0;
    const tasks = new MarketTasks(
      async (_id, _signal, progress) => {
        progress(5, 10);
        return bundle;
      },
      async () => {
        installed++;
        return true;
      },
      () => [],
      () => {},
    );
    const job = tasks.enqueue('org.test.plugin');
    await tick();
    expect(tasks.list()[0]).toMatchObject({
      state: 'ready',
      received: 5,
      total: 10,
      permissions: ['ai'],
      addedPermissions: ['ai'],
    });
    expect(installed).toBe(0);
    await tasks.install(job.id);
    expect(installed).toBe(1);
    expect(tasks.list()[0].state).toBe('done');
  });
  it('cancels downloads and ignores late packages, then allows an explicit retry', async () => {
    let complete: (b: PluginBundle) => void = () => {};
    const tasks = new MarketTasks(
      async () =>
        new Promise((r) => {
          complete = r;
        }),
      async () => true,
      () => [],
      () => {},
    );
    const job = tasks.enqueue('org.test.plugin');
    await tick();
    tasks.cancel(job.id);
    complete(bundle);
    await tick();
    expect(tasks.list()[0].state).toBe('cancelled');
    tasks.retry(job.id);
    await tick();
    complete(bundle);
    await tick();
    expect(tasks.list()[0].state).toBe('ready');
  });
  it('keeps failures visible and never installs a failed download', async () => {
    const tasks = new MarketTasks(
      async () => {
        throw new Error('damaged');
      },
      async () => true,
      () => [],
      () => {},
    );
    const job = tasks.enqueue('org.test.plugin');
    await tick();
    expect(tasks.list()[0]).toMatchObject({ state: 'failed', error: 'damaged' });
    await expect(tasks.install(job.id)).rejects.toThrow();
  });
});
