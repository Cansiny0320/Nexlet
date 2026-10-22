// Fixed synthetic inputs; never touches the system clipboard or real plugin servers.
// --before and --after must be frozen source snapshots. App measurements require built dist/.
import { registerHooks, stripTypeScriptTypes, syncBuiltinESMExports } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir, cpus, release } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';

const options = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const index = arg.indexOf('=');
    if (index < 3) throw Error('Use --key=value');
    return [arg.slice(2, index), arg.slice(index + 1)];
  }),
);
const run = promisify(execFile);
const percentile = (values, fraction) =>
  [...values].sort((a, b) => a - b)[
    Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)
  ];
const summary = (values) => ({
  samples: values.length,
  p50: percentile(values, 0.5),
  p95: percentile(values, 0.95),
});
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hashFile = async (file) =>
  createHash('sha256')
    .update(await fs.readFile(file))
    .digest('hex');

if (options.child === 'hotspots') {
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
        const url = new URL(specifier, context.parentURL);
        if (existsSync(fileURLToPath(url) + '.ts')) return next(url.href + '.ts', context);
      }
      return next(specifier, context);
    },
    load(url, context, next) {
      if (url.startsWith('file:') && url.endsWith('.ts'))
        return {
          format: 'module',
          source: stripTypeScriptTypes(readFileSync(new URL(url), 'utf8'), { mode: 'transform' }),
          shortCircuit: true,
        };
      if (url.includes('/src/shared/locales/') && url.endsWith('.json'))
        return {
          format: 'module',
          source: 'export default ' + readFileSync(new URL(url), 'utf8'),
          shortCircuit: true,
        };
      return next(url, context);
    },
  });
  const { Store } = await import(pathToFileURL(path.join(options.root, 'src/main/store.ts')).href);
  const { LinuxFileSearch } = await import(
    pathToFileURL(path.join(options.root, 'src/main/linux-search.ts')).href
  );
  const directory = await fs.mkdtemp(path.join(tmpdir(), 'nexlet-hotspots-'));
  const results = {};
  async function measure(fn, samples = 7) {
    for (let i = 0; i < 2; i++) await fn();
    const times = [],
      cpu = [];
    for (let i = 0; i < samples; i++) {
      const start = performance.now(),
        usage = process.cpuUsage();
      await fn();
      const used = process.cpuUsage(usage);
      times.push(performance.now() - start);
      cpu.push((used.user + used.system) / 1000);
    }
    return { times, cpu };
  }
  for (const [name, count, bytes] of [
    ['short', 500, 1024],
    ['normal', 500, 32768],
    ['large', 5000, 32768],
    ['summary', 40, 1048576],
  ]) {
    const store = new Store(path.join(directory, name));
    const insert = store.db.prepare(
      'INSERT INTO clips(id,hash,created,favorite,data) VALUES(?,?,?,?,?)',
    );
    store.db.exec('BEGIN');
    for (let i = 0; i < count; i++) {
      const id = String(i).padStart(5, '0');
      const item = {
        id,
        hash: id,
        kind: 'text',
        text: 'x'.repeat(bytes - 32) + ' ÄBC needle-' + id,
        createdAt: i + 1,
        favorite: false,
      };
      insert.run(id, id, i + 1, 0, JSON.stringify(item));
    }
    store.db.exec('COMMIT');
    const migrationStart = performance.now();
    if (store.backfillClips) while (store.backfillClips()) {}
    const migrationMs = performance.now() - migrationStart;
    if (name === 'summary') {
      const index = store.clipIndex();
      results[name] = {
        ...(await measure(() => {
          const page = store.clipPage(index.ids, index.revision);
          if (page.items.length !== count) throw Error('Unexpected summary count');
        })),
        migrationMs,
      };
    } else {
      results[name] = {
        ...(await measure(() => {
          const index = store.clipIndex('äbc needle-' + String(count - 1).padStart(5, '0'));
          if (index.ids.length !== 1) throw Error('Unexpected search count');
        })),
        migrationMs,
      };
    }
    store.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    results[name].databaseBytes = (await fs.stat(path.join(directory, name, 'nexlet.sqlite'))).size;
    store.close();
  }
  const tree = path.join(directory, 'files');
  await fs.mkdir(tree);
  for (let i = 0; i < 80; i++) {
    const dir = path.join(tree, 'dir-' + i);
    await fs.mkdir(dir);
    await Promise.all(
      Array.from({ length: 80 }, (_, j) =>
        fs.writeFile(path.join(dir, 'file-' + String(j).padStart(3, '0') + '.txt'), 'fixture'),
      ),
    );
  }
  let counts = { opendir: 0, lstat: 0 };
  const originalOpen = fs.opendir,
    originalStat = fs.lstat;
  fs.opendir = (...args) => {
    counts.opendir++;
    return originalOpen(...args);
  };
  fs.lstat = (...args) => {
    counts.lstat++;
    return originalStat(...args);
  };
  syncBuiltinESMExports();
  const search = new LinuxFileSearch(() => [tree]);
  const firstStart = performance.now();
  await search.search(1, 'unmatched');
  results.linuxFirst = { ms: performance.now() - firstStart, io: { ...counts } };
  counts = { opendir: 0, lstat: 0 };
  let query = 0;
  results.linuxRepeated = {
    ...(await measure(async () => {
      const found = await search.search(
        1,
        'file-' + String(query++ % 80).padStart(3, '0') + '.txt',
      );
      if (found.items.length !== 80) throw Error('Unexpected Linux result count');
    })),
    io: counts,
    queries: 9,
  };
  await fs.writeFile(path.join(tree, 'dir-0', 'new-needle.txt'), 'new');
  counts = { opendir: 0, lstat: 0 };
  const changed = await search.search(1, 'new-needle');
  if (changed.items.length !== 1) throw Error('Missed directory change');
  results.linuxChanged = { io: counts };
  search.reset();
  fs.opendir = originalOpen;
  fs.lstat = originalStat;
  syncBuiltinESMExports();
  if (process.platform === 'darwin') {
    const { default: koffi } = await import('koffi');
    const cf = koffi.load('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation');
    const callback = koffi.proto('void BenchmarkTimer(void *,void *)');
    const timerCreate = cf.func('CFRunLoopTimerCreate', 'void *', [
      'void *',
      'double',
      'double',
      'uint64_t',
      'intptr_t',
      koffi.pointer(callback),
      'void *',
    ]);
    const addTimer = cf.func('void CFRunLoopAddTimer(void *,void *,void *)');
    const loop = cf.func('void *CFRunLoopGetCurrent()')();
    const mode = koffi.decode(cf.symbol('kCFRunLoopDefaultMode'), 'void *');
    const runMode = cf.func('int CFRunLoopRunInMode(void *,double,bool)');
    const now = cf.func('double CFAbsoluteTimeGetCurrent()');
    const cb = koffi.register(() => {}, koffi.pointer(callback));
    const timer = timerCreate(null, now() + 60, 60, 0, 0, cb, null);
    addTimer(loop, timer, mode);
    for (const held of [false, true]) {
      const start = performance.now(),
        usage = process.cpuUsage();
      let wakeups = 0;
      if (options.label === 'before') {
        await new Promise((resolve) => {
          const polling = setInterval(() => {
            runMode(mode, 0, true);
            wakeups++;
            if (performance.now() - start >= 1000) {
              clearInterval(polling);
              resolve();
            }
          }, 8);
        });
      } else {
        while (performance.now() - start < 1000) {
          runMode(mode, held ? 0.008 : 0.05, true);
          wakeups++;
        }
      }
      const used = process.cpuUsage(usage);
      results[held ? 'nativeHeld' : 'nativeIdle'] = {
        wakeups,
        cpuMs: (used.user + used.system) / 1000,
        ms: performance.now() - start,
      };
    }
    cf.func('void CFRunLoopTimerInvalidate(void *)')(timer);
    cf.func('void CFRelease(void *)')(timer);
    koffi.unregister(cb);
  }
  await fs.writeFile(options.output, JSON.stringify(results));
  await fs.rm(directory, { recursive: true, force: true });
} else {
  if (!options.before || !options.after || !options.output)
    throw Error('Required --before=DIR --after=DIR --output=FILE');
  const runs = Number(options.runs || 5);
  if (!Number.isInteger(runs) || runs < 1) throw Error('Invalid run count');
  const roots = { before: path.resolve(options.before), after: path.resolve(options.after) };
  const report = {
    measuredAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    cpu: cpus()[0].model,
    os: release(),
    node: process.version,
    method: {
      runs,
      order: 'alternating before/after',
      samplesPerHotspot: 7,
      warmups: 2,
      syntheticDataOnly: true,
      linux: 'algorithm executed on host OS, not Linux hardware',
      native:
        'real CFRunLoop timer source, no mouse hook or input injection; independent Node process',
      database:
        'Store method microbenchmark; production Worker responsiveness is measured separately',
      concurrentFeatureWork:
        'The baseline snapshot predates separate productivity feature edits; whole-app measurements may include those changes.',
    },
    roots,
    hashes: {},
    samples: [],
    summary: {},
  };
  for (const [label, root] of Object.entries(roots))
    report.hashes[label] = Object.fromEntries(
      await Promise.all(
        [
          'src/main/store.ts',
          'src/main/linux-search.ts',
          'src/main/panel-native-worker.ts',
          'pnpm-lock.yaml',
        ].map(async (name) => [name, await hashFile(path.join(root, name))]),
      ),
    );
  const workspace = await fs.mkdtemp(path.join(tmpdir(), 'nexlet-hotspot-results-'));
  for (let round = 0; round < runs; round++) {
    for (const label of round % 2 ? ['after', 'before'] : ['before', 'after']) {
      const output = path.join(workspace, `${round}-${label}.json`);
      await run(
        process.execPath,
        [
          fileURLToPath(import.meta.url),
          '--child=hotspots',
          '--root=' + roots[label],
          '--label=' + label,
          '--output=' + output,
        ],
        { maxBuffer: 1024 * 1024 },
      );
      report.samples.push({ round, label, values: JSON.parse(await fs.readFile(output, 'utf8')) });
      await fs.writeFile(options.output, JSON.stringify(report, null, 2));
      process.stdout.write(`Completed hotspots ${round + 1}/${runs} ${label}\n`);
    }
  }
  for (const label of ['before', 'after']) {
    const samples = report.samples.filter((sample) => sample.label === label);
    report.summary[label] = {};
    for (const metric of ['short', 'normal', 'large', 'summary', 'linuxRepeated'])
      report.summary[label][metric] = {
        ms: summary(samples.flatMap((sample) => sample.values[metric].times)),
        cpuMs: summary(samples.flatMap((sample) => sample.values[metric].cpu)),
        databaseBytes: samples[0].values[metric].databaseBytes,
        migrationMs: samples[0].values[metric].migrationMs,
        io: samples[0].values[metric].io,
      };
    report.summary[label].linuxFirstMs = summary(
      samples.map((sample) => sample.values.linuxFirst.ms),
    );
    for (const metric of ['nativeIdle', 'nativeHeld'])
      if (samples[0].values[metric])
        report.summary[label][metric] = {
          wakeups: summary(samples.map((sample) => sample.values[metric].wakeups)),
          cpuMs: summary(samples.map((sample) => sample.values[metric].cpuMs)),
        };
  }
  await fs.writeFile(options.output, JSON.stringify(report, null, 2));
  process.stdout.write(JSON.stringify(report.summary, null, 2) + '\n');
}
