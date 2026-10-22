// Frozen Electron builds, synthetic images/text/network only. No real clipboard reads or writes.
import { _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir, cpus } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import AdmZip from 'adm-zip';

const options = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const i = arg.indexOf('=');
    return [arg.slice(2, i), arg.slice(i + 1)];
  }),
);
if (!options.before || !options.after || !options.output)
  throw Error('Required --before=DIR --after=DIR --output=FILE');
const roots = { before: path.resolve(options.before), after: path.resolve(options.after) };
const runs = Number(options.runs || 5);
if (!Number.isInteger(runs) || runs < 1) throw Error('Invalid runs');
const report = {
  measuredAt: new Date().toISOString(),
  cpu: cpus()[0].model,
  platform: process.platform,
  arch: process.arch,
  node: process.version,
  method: {
    runs,
    order: 'alternating',
    images:
      'first call per size cold, then 3 distinct warm captures; identical nativeImage PNG inputs, no real clipboard; time includes database persistence',
    lag: 'maximum main-thread timer delay during operation, 1 ms monitor with timer turns before/after; not renderer frame latency',
    cpu: 'process.cpuUsage includes clipboard Worker threads in the main process, but excludes the separate image renderer; not total app CPU',
    memory:
      'Electron process working sets summed, shared pages may be counted multiple times; includes fixtures',
    plugin: 'actual launch with simulated 400 ms index + 400 ms archive, or 2000 ms failure',
    appScope:
      'Separate productivity changes are present in the after snapshot; whole-app startup/RSS are not attributable solely to performance changes',
  },
  roots,
  hashes: {},
  samples: [],
  summary: {},
};
await mkdir(path.dirname(options.output), { recursive: true });
for (const [label, root] of Object.entries(roots))
  report.hashes[label] = createHash('sha256')
    .update(await readFile(path.join(root, 'dist/main/index.cjs')))
    .digest('hex');
const save = () => writeFile(options.output, JSON.stringify(report, null, 2));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function archive(id, version) {
  const manifest = {
    id,
    name: 'Benchmark',
    description: 'fixture',
    version,
    apiVersion: 1,
    main: 'index.html',
    permissions: [],
    features: [{ code: 'open', name: 'Benchmark', keywords: ['benchmark'] }],
  };
  const html = '<html><body>Benchmark</body></html>';
  const zip = new AdmZip();
  zip.addFile('plugin.json', Buffer.from(JSON.stringify(manifest)));
  zip.addFile('index.html', Buffer.from(html));
  return { manifest, html, zip: zip.toBuffer().toString('base64') };
}
async function sample(label, round) {
  const directory = await mkdtemp(path.join(tmpdir(), 'nexlet-background-bench-'));
  const env = {
    ...process.env,
    NEXLET_TEST_MODE: '1',
    NEXLET_TEST_LOCALE: 'zh-CN',
    NEXLET_TEST_DEFER_CATALOG_SCAN: '1',
    NEXLET_USER_DATA: directory,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const started = performance.now();
  const application = await electron.launch({ args: [roots[label]], env });
  try {
    const page = await application.firstWindow();
    await page.waitForFunction(
      () => document.querySelector('.launcher-input')?.getBoundingClientRect().width > 0,
      undefined,
      { polling: 'raf' },
    );
    const result = {
      label,
      round,
      startupMs: performance.now() - started,
      images: {},
      plugins: {},
    };
    await application.evaluate(() => {
      const n = globalThis.__nexlet;
      n.store.set('settings', {
        ...n.store.settings(),
        clipboardEnabled: false,
        autoCheckUpdates: false,
        hideOnBlur: false,
        maxClipboardItems: 5000,
      });
      let sequence = 0;
      n.platform.sequence = () => ++sequence;
      globalThis.__measure = async (work) => {
        let previous = performance.now(),
          maxLagMs = 0;
        const timer = setInterval(() => {
          const now = performance.now();
          maxLagMs = Math.max(maxLagMs, now - previous - 1);
          previous = now;
        }, 1);
        await new Promise((resolve) => setTimeout(resolve, 2));
        const start = performance.now(),
          usage = process.cpuUsage();
        try {
          const value = await work();
          const ms = performance.now() - start,
            cpu = process.cpuUsage(usage);
          await new Promise((resolve) => setTimeout(resolve, 2));
          return { ms, maxLagMs, processCpuMs: (cpu.user + cpu.system) / 1000, value };
        } finally {
          clearInterval(timer);
        }
      };
    });
    result.homeMemory = await application.evaluate(({ app }) => ({
      mainMiB: process.memoryUsage().rss / 1024 ** 2,
      totalMiB:
        app.getAppMetrics().reduce((sum, process) => sum + process.memory.workingSetSize, 0) / 1024,
    }));
    result.wakeMs = [];
    for (let i = 0; i < 5; i++)
      result.wakeMs.push(
        await application.evaluate(async () => {
          const n = globalThis.__nexlet;
          n.main.hide();
          const start = performance.now();
          await n.show();
          return performance.now() - start;
        }),
      );
    for (const [name, width, height] of [
      ['1080p', 1920, 1080],
      ['4k', 3840, 2160],
      ['24mp', 6000, 4000],
    ]) {
      await application.evaluate(
        ({ nativeImage }, { width, height }) => {
          const n = globalThis.__nexlet;
          n.clips.images?.window?.destroy();
          const inputs = [];
          for (let variant = 1; variant <= 4; variant++) {
            const bitmap = Buffer.alloc(width * height * 4);
            for (let y = 0; y < height; y++)
              for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                bitmap[i] = x % 256;
                bitmap[i + 1] = y % 256;
                bitmap[i + 2] = (x * 3 + y * 5 + variant) % 256;
                bitmap[i + 3] = 255;
              }
            inputs.push(nativeImage.createFromBitmap(bitmap, { width, height }).toPNG());
          }
          globalThis.__images = inputs;
        },
        { width, height },
      );
      result.images[name] = [];
      for (let attempt = 0; attempt < 4; attempt++)
        result.images[name].push(
          await application.evaluate(async ({ clipboard, app }, attempt) => {
            const n = globalThis.__nexlet,
              bytes = globalThis.__images[attempt];
            clipboard.read = async () => [
              {
                types: ['image/png'],
                getType: async () => new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
              },
            ];
            const measurement = await globalThis.__measure(() => n.clips.capture(true));
            if (n.clips.error) throw Error(n.clips.error);
            return {
              ...measurement,
              pngBytes: bytes.length,
              cold: attempt === 0,
              mainMiB: process.memoryUsage().rss / 1024 ** 2,
              totalMiB:
                app.getAppMetrics().reduce((sum, item) => sum + item.memory.workingSetSize, 0) /
                1024,
            };
          }, attempt),
        );
    }
    await application.evaluate(async () => {
      const n = globalThis.__nexlet;
      delete globalThis.__images;
      n.clips.images?.window?.destroy();
      if (n.clipStore) await n.clipStore.clearClips(true);
      else n.store.deleteClips(n.store.clipIndex().ids);
      const insert = n.store.db.prepare(
        'INSERT INTO clips(id,hash,created,favorite,data) VALUES(?,?,?,?,?)',
      );
      n.store.db.exec('BEGIN');
      for (let i = 0; i < 5000; i++) {
        const id = 'text-' + i;
        const item = {
          id,
          hash: id,
          text: 'x'.repeat(32740) + ' ÄBC needle-' + i,
          createdAt: Date.now() + i,
          kind: 'text',
          favorite: false,
        };
        insert.run(id, id, item.createdAt, 0, JSON.stringify(item));
      }
      n.store.db.exec('COMMIT');
      if (n.store.backfillClips) while (n.store.backfillClips()) {}
    });
    result.largeSearch = [];
    for (let i = 0; i < 6; i++)
      result.largeSearch.push(
        await application.evaluate(async () => {
          const n = globalThis.__nexlet;
          return globalThis.__measure(async () => {
            const result = await (n.clipStore || n.store).clipIndex('äbc needle-4999');
            if (result.ids.length !== 1) throw Error('Search result mismatch');
            return result.ids.length;
          });
        }),
      );
    result.largeSearch.shift();
    await application.evaluate(() => {
      const n = globalThis.__nexlet;
      n.catalog.items = Array.from({ length: 1000 }, (_, i) => ({
        id: 'app:bench-' + i,
        name: 'Fixture ' + i,
        kind: 'app',
        subtitle: 'Benchmark',
        keywords: [],
      }));
      n.main.webContents.send('host-change', 'state');
    });
    await page.locator('.launcher-input').fill('Fixture 999');
    await page.locator('[data-command-id="app:bench-999"]').waitFor();
    await sleep(150);
    await application.evaluate(() => {
      const n = globalThis.__nexlet;
      const counts = (globalThis.__counts = {
        search: 0,
        shortcuts: 0,
        settings: 0,
        panelConfig: 0,
      });
      for (const [owner, method, key] of [
        [n.matcher, 'search', 'search'],
        [n.shortcuts, 'apply', 'shortcuts'],
        [n.store, 'settings', 'settings'],
        [n.panelConfig, 'read', 'panelConfig'],
      ]) {
        const original = owner[method].bind(owner);
        owner[method] = (...args) => {
          counts[key]++;
          return original(...args);
        };
      }
    });
    await sleep(1050);
    result.idleCounts = await application.evaluate(() => ({ ...globalThis.__counts }));
    await application.evaluate(() => {
      for (const key in globalThis.__counts) globalThis.__counts[key] = 0;
    });
    for (let i = 1; i <= 10; i++) {
      await application.evaluate(
        (_, i) => globalThis.__nexlet.updates.set({ phase: 'downloading', percent: i }),
        i,
      );
      await sleep(90);
    }
    result.progressCounts = await application.evaluate(() => ({ ...globalThis.__counts }));
    for (const mode of ['slow', 'timeout']) {
      const id = 'org.nexlet.bench-' + mode;
      const initial = archive(id, '1.0.0'),
        update = archive(id, '1.1.0');
      result.plugins[mode] = await application.evaluate(
        async (_, { id, mode, initial, update }) => {
          const n = globalThis.__nexlet;
          await n.plugins.installBundle(
            {
              manifest: initial.manifest,
              files: new Map([
                ['index.html', Buffer.from(initial.html)],
                ['plugin.json', Buffer.from(JSON.stringify(initial.manifest))],
              ]),
            },
            { source: 'marketplace' },
          );
          n.marketplace.download = async (url) => {
            await new Promise((resolve) => setTimeout(resolve, mode === 'timeout' ? 2000 : 400));
            if (mode === 'timeout') throw Error('simulated timeout');
            if (url.endsWith('index.json'))
              return Buffer.from(
                JSON.stringify({
                  schemaVersion: 1,
                  plugins: [
                    {
                      id,
                      name: 'Benchmark',
                      description: 'fixture',
                      author: 'Nexlet',
                      category: 'test',
                      version: '1.1.0',
                      platforms: ['darwin', 'win32', 'linux'],
                      minHostVersion: '0.0.1',
                      download:
                        'https://github.com/Cansiny0320/Nexlet-plugins/releases/download/v1.1.0/benchmark.nexlet',
                    },
                  ],
                }),
              );
            return Buffer.from(update.zip, 'base64');
          };
          const measurement = await globalThis.__measure(() =>
            n.plugins.launch(id, 'open', 'fixed input'),
          );
          const activeVersion = n.plugins.runtime.sessions.get(id)?.record.manifest.version;
          if (n.plugins.backgroundUpdates)
            await Promise.all([...n.plugins.backgroundUpdates.values()].map((entry) => entry.done));
          await n.plugins.runtime.stop(id);
          let nextVersion;
          if (mode === 'slow' && n.plugins.staging) {
            await n.plugins.launch(id, 'open', 'next input');
            nextVersion = n.plugins.runtime.sessions.get(id)?.record.manifest.version;
            await n.plugins.runtime.stop(id);
            if (nextVersion !== '1.1.0') throw Error('Staged update did not apply');
          }
          return { ...measurement, activeVersion, nextVersion };
        },
        { id, mode, initial, update },
      );
    }
    report.samples.push(result);
    await save();
    console.log(
      JSON.stringify({
        label,
        round,
        startupMs: result.startupMs,
        image4k: result.images['4k'].map((r) => r.ms),
        searchLag: result.largeSearch.map((r) => r.maxLagMs),
        pluginSlow: result.plugins.slow.ms,
      }),
    );
  } finally {
    await application.close();
    await rm(directory, { recursive: true, force: true });
  }
}
for (let round = 0; round < runs; round++)
  for (const label of round % 2 ? ['after', 'before'] : ['before', 'after'])
    await sample(label, round);
const summarize = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    samples: values.length,
    p50: sorted[Math.ceil(sorted.length / 2) - 1],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
  };
};
for (const label of ['before', 'after']) {
  const samples = report.samples.filter((sample) => sample.label === label);
  const result = (report.summary[label] = {
    startupMs: summarize(samples.map((s) => s.startupMs)),
    wakeMs: summarize(samples.flatMap((s) => s.wakeMs)),
    homeRssMiB: summarize(samples.map((s) => s.homeMemory.totalMiB)),
    images: {},
    largeSearch: {},
    plugins: {},
    idleCounts: samples[0].idleCounts,
    progressCounts: samples[0].progressCounts,
  });
  for (const size of ['1080p', '4k', '24mp']) {
    result.images[size] = {};
    for (const cold of [true, false]) {
      const values = samples.flatMap((s) => s.images[size].filter((m) => m.cold === cold));
      result.images[size][cold ? 'cold' : 'warm'] = Object.fromEntries(
        ['ms', 'maxLagMs', 'processCpuMs', 'totalMiB'].map((key) => [
          key,
          summarize(values.map((v) => v[key])),
        ]),
      );
    }
  }
  for (const key of ['ms', 'maxLagMs', 'processCpuMs'])
    result.largeSearch[key] = summarize(samples.flatMap((s) => s.largeSearch.map((v) => v[key])));
  for (const mode of ['slow', 'timeout'])
    result.plugins[mode] = summarize(samples.map((s) => s.plugins[mode].ms));
}
await save();
console.log(JSON.stringify(report.summary, null, 2));
