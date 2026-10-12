// Run against two frozen, already-built app directories. Never builds or edits them.
// Resource scenarios temporarily replace the system clipboard; original contents
// stay in a separate guard process plus a mode-0600 recovery file. The file is
// removed only after restoration/read-back succeeds; contents never enter reports.
import { _electron as electron } from '@playwright/test';
import { mkdir, mkdtemp, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const exec = promisify(execFile);
const options = Object.fromEntries(process.argv.slice(2).map(value => {
  const index = value.indexOf('=');
  if (!value.startsWith('--') || index < 0) throw Error('Use --option=value');
  return [value.slice(2, index), value.slice(index + 1)];
}));
if (!options.before || !options.after || !options.output) throw Error('Required: --before=DIR --after=DIR --output=JSON');
const roots = { before: path.resolve(options.before), after: path.resolve(options.after) };
const runs = Number(options.runs || 10), resourceRuns = Number(options['resource-runs'] || 3);
const stage = options.stage || 'all';
if (!['startup', 'resources', 'all'].includes(stage)) throw Error('Invalid stage');
if (![runs, resourceRuns].every(value => Number.isInteger(value) && value > 0)) throw Error('Invalid run count');
const output = path.resolve(options.output);
await mkdir(path.dirname(output), { recursive: true });
const workspace = await mkdtemp(path.join(path.dirname(output), 'benchmark-data-'));
const clipboardBackupFile = path.join(workspace, 'clipboard-backup.json');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const round = value => Math.round(value * 100) / 100;
let interrupted = false;
process.once('SIGINT', () => { interrupted = true; });
const checkInterrupted = () => { if (interrupted) throw Error('Benchmark interrupted; restoring clipboard'); };
const envFor = data => {
  const env = { ...process.env, NEXLET_TEST_MODE: '1', NEXLET_USER_DATA: data };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
};
const report = {
  measuredAt: new Date().toISOString(), platform: process.platform, arch: process.arch,
  osRelease: os.release(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length,
  totalMemoryGiB: round(os.totalmem() / 1024 ** 3), node: process.version,
  method: {
    stage, runs, resourceRuns, isolatedData: true, testMode: true,
    startup: 'New process to visible enabled launcher input, observed every animation frame; same Playwright driver overhead; OS file caches not cleared. One warmup per build, then alternating order.',
    tools: 'Renderer-local clock from DOM click to visible JSON editor mutation, including first dynamic import; no locator polling/backoff or actionability delay.',
    resources: 'Actual clipboard polling explicitly started in test mode; 2s settling, 12 samples at 500ms, no forced GC. Separate clipboard guard is excluded from app process totals.',
    memory: 'OS RSS summed across app.getAppMetrics PIDs, includes shared-page double counting. Main private memory and renderer JS heap are supplementary.',
    image: { width: 2560, height: 1440, pattern: 'deterministic BGRA x/y gradient' }
  }, builds: {}, startup: [], resources: []
};
for (const [label, root] of Object.entries(roots)) {
  const files = await readdir(path.join(root, 'dist/renderer/assets'));
  const entry = files.find(file => /^index-.*\.js$/.test(file));
  const main = await readFile(path.join(root, 'dist/main/index.cjs'));
  const renderer = await readFile(path.join(root, 'dist/renderer/assets', entry));
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  report.builds[label] = { root, version: packageJson.version, entry, entryBytes: renderer.length,
    mainSha256: createHash('sha256').update(main).digest('hex'),
    entrySha256: createHash('sha256').update(renderer).digest('hex'),
    lockSha256: createHash('sha256').update(await readFile(path.join(root, 'package-lock.json'))).digest('hex') };
}
const save = () => writeFile(output, JSON.stringify(report, null, 2) + '\n');

async function launch(label) {
  checkInterrupted();
  const data = await mkdtemp(path.join(workspace, label + '-'));
  const db = new DatabaseSync(path.join(data, 'nexlet.sqlite'));
  db.exec('CREATE TABLE documents (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  db.prepare('INSERT INTO documents VALUES (?,?)').run('settings', JSON.stringify({
    clipboardEnabled: true, hideOnBlur: false, theme: 'light', searchPaths: []
  }));
  db.close();
  const started = performance.now();
  const application = await electron.launch({ args: [roots[label]], env: envFor(data), timeout: 30000 });
  try {
    const page = await application.firstWindow();
    const ready = await page.waitForFunction(() => {
      const input = document.querySelector('.launcher-input');
      if (!input || input.disabled || !input.getBoundingClientRect().width) return false;
      return { rendererReadyMs: performance.now(), domInteractiveMs: performance.getEntriesByType('navigation')[0]?.domInteractive };
    }, undefined, { polling: 'raf' });
    const rendererTiming = await ready.jsonValue();
    await application.evaluate(async () => {
      const window = globalThis.__nexlet.main;
      if (!window.isVisible()) await new Promise(resolve => window.once('show', resolve));
    });
    const startupMs = performance.now() - started;
    const versions = await application.evaluate(() => process.versions);
    report.versions ||= versions;
    return { application, page, startupMs, rendererTiming };
  } catch (error) { await application.close(); throw error; }
}

async function waitForCatalog(application) {
  await application.evaluate(async () => {
    const deadline = Date.now() + 15000;
    while (globalThis.__nexlet.catalog.loading && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    if (globalThis.__nexlet.catalog.loading) throw Error('Catalog did not settle');
  });
}

async function openJson(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const started = performance.now();
    const timer = setTimeout(() => { observer.disconnect(); reject(Error('JSON editor mount timeout')); }, 15000);
    const observer = new MutationObserver(() => {
      const editor = document.querySelector('.cm-content[aria-label="JSON 输入"]');
      if (editor?.getBoundingClientRect().width) {
        observer.disconnect(); clearTimeout(timer); resolve(performance.now() - started);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true });
    const button = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'JSON 工具');
    if (!button) { observer.disconnect(); clearTimeout(timer); reject(Error('JSON tool button missing')); }
    else button.click();
  }));
}

async function startupRun(label, index, warmup = false) {
  const { application, page, startupMs, rendererTiming } = await launch(label);
  try {
    await waitForCatalog(application);
    const firstJsonMs = await openJson(page);
    await page.getByRole('button', { name: '返回首页', exact: true }).evaluate(button => button.click());
    await page.locator('.launcher-input').waitFor({ state: 'visible' });
    const repeatJsonMs = await openJson(page);
    if (!warmup) {
      report.startup.push({ label, index, startupMs: round(startupMs), ...rendererTiming, firstJsonMs: round(firstJsonMs), repeatJsonMs: round(repeatJsonMs) });
      await save();
      console.log(JSON.stringify({ stage: 'startup', label, index, startupMs: round(startupMs) }));
    }
  } finally { await application.close(); }
}

async function sampleMemory(application, cdp) {
  const state = await application.evaluate(async ({ app }) => ({
    processes: app.getAppMetrics().map(metric => ({ pid: metric.pid, type: metric.type, workingSetKiB: metric.memory.workingSetSize })),
    main: { pid: process.pid, ...(await process.getProcessMemoryInfo()), heapUsedBytes: process.memoryUsage().heapUsed },
    reads: globalThis.__performanceReads, catalogItems: globalThis.__nexlet.catalog.items.length
  }));
  const { stdout } = await exec('/bin/ps', ['-p', state.processes.map(p => p.pid).join(','), '-o', 'pid=,rss=']);
  const rss = new Map(stdout.trim().split('\n').filter(Boolean).map(line => line.trim().split(/\s+/).map(Number)));
  for (const proc of state.processes) proc.rssKiB = rss.get(proc.pid) || 0;
  const metrics = await cdp.send('Performance.getMetrics');
  return {
    elapsed: Date.now(), rssMiB: round(state.processes.reduce((sum, p) => sum + p.rssKiB, 0) / 1024),
    mainPrivateMiB: round(state.main.private / 1024), mainHeapMiB: round(state.main.heapUsedBytes / 1024 ** 2),
    rendererHeapMiB: round(metrics.metrics.find(m => m.name === 'JSHeapUsedSize').value / 1024 ** 2),
    processes: state.processes, reads: state.reads, catalogItems: state.catalogItems
  };
}

async function resourceRun(label, scenario, index, guard) {
  await guard.evaluate(async ({ clipboard, ClipboardItem }, image) => {
    if (image) await clipboard.write([new ClipboardItem({ 'image/png': new Blob([globalThis.__fixturePng], { type: 'image/png' }) })]);
    else await clipboard.writeText('Nexlet performance fixture 2026-10-12');
    globalThis.__lastFixture = image ? 'image' : 'text';
  }, scenario === 'image');
  const { application, page } = await launch(label);
  try {
    await waitForCatalog(application);
    const nativeProbe = await application.evaluate(async ({ clipboard }, probe) => {
      globalThis.__performanceReads = 0;
      const original = clipboard.read.bind(clipboard);
      clipboard.read = (...args) => { globalThis.__performanceReads++; return original(...args); };
      let nativeChangeObserved;
      if (probe) {
        const before = globalThis.__nexlet.platform.sequence();
        await clipboard.writeText('Nexlet performance fixture 2026-10-12');
        const after = globalThis.__nexlet.platform.sequence();
        nativeChangeObserved = before !== null && after !== null && before !== after;
        if (!nativeChangeObserved) throw Error('Native counter did not observe a real pasteboard write');
      }
      globalThis.__nexlet.clips.start();
      return nativeChangeObserved;
    }, label === 'after' && scenario === 'home');
    if (scenario === 'json') {
      await openJson(page);
      await page.getByRole('textbox', { name: 'JSON 输入', exact: true }).fill(JSON.stringify({ records: Array.from({ length: 200 }, (_, i) => ({ id: i, value: 'benchmark-' + i })) }));
      await page.getByLabel('JSON 解析结果').filter({ hasText: 'records' }).waitFor();
    }
    if (scenario === 'hidden') await application.evaluate(() => globalThis.__nexlet.main.hide());
    await delay(2000);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const start = await application.evaluate(() => ({ cpu: process.cpuUsage(), time: performance.now(), reads: globalThis.__performanceReads }));
    const samples = [];
    for (let i = 0; i < 12; i++) { checkInterrupted(); await delay(500); samples.push(await sampleMemory(application, cdp)); }
    const end = await application.evaluate((_, start) => {
      const cpu = process.cpuUsage(start.cpu);
      const clips = globalThis.__nexlet.store.clips();
      return { mainCpuPercent: (cpu.user + cpu.system) / ((performance.now() - start.time) * 10),
        readsDuringSampling: globalThis.__performanceReads - start.reads,
        totalReads: globalThis.__performanceReads, sequenceAvailable: globalThis.__nexlet.platform.sequence() !== null,
        capturedKinds: [...new Set(clips.map(item => item.kind))], error: globalThis.__nexlet.clips.error };
    }, start);
    if (!Number.isFinite(end.mainCpuPercent) || !Number.isInteger(end.readsDuringSampling)) throw Error('Invalid CPU/read-counter measurement');
    if (end.error || !end.capturedKinds.includes(scenario === 'image' ? 'image' : 'text')) throw Error('Capture scenario failed: ' + JSON.stringify(end));
    const integrity = await guard.evaluate(async ({ clipboard, nativeImage }) => {
      if (globalThis.__lastFixture === 'text') return await clipboard.readText() === 'Nexlet performance fixture 2026-10-12';
      const item = (await clipboard.read()).find(item => item.types.includes('image/png'));
      if (!item) return false;
      const blob = await item.getType('image/png');
      const image = nativeImage.createFromBuffer(Buffer.from(await blob.arrayBuffer()));
      return image.getSize().width === 2560 && image.getSize().height === 1440 && image.toBitmap().equals(globalThis.__fixtureBitmap);
    });
    if (!integrity) throw Error('System clipboard changed during benchmark; sample rejected');
    report.resources.push({ label, scenario, index, nativeChangeObserved: nativeProbe, ...end, samples });
    await save();
    console.log(JSON.stringify({ stage: 'resources', label, scenario, index, rssMiB: round(samples.reduce((n, s) => n + s.rssMiB, 0) / samples.length), reads: end.readsDuringSampling, mainCpuPercent: round(end.mainCpuPercent) }));
  } finally { await application.close(); }
}

let guard;
try {
  if (stage !== 'resources') {
    for (const label of ['before', 'after']) await startupRun(label, -1, true);
    for (let i = 0; i < runs; i++) for (const label of i % 2 ? ['after', 'before'] : ['before', 'after']) await startupRun(label, i);
  }
  if (stage !== 'startup') {
    if (process.platform !== 'darwin') throw Error('Resource fixture currently validated only on macOS');
    const { stdout } = await exec('/bin/ps', ['-axo', 'comm=']);
    if (stdout.split('\n').some(line => /\/Nexlet\.app\/Contents\/MacOS\/Nexlet$/.test(line))) throw Error('Quit the installed Nexlet before clipboard measurements');
    const guardFile = path.join(workspace, 'clipboard-guard.cjs');
    await writeFile(guardFile, "const {app}=require('electron');app.setPath('userData',process.env.NEXLET_USER_DATA);app.whenReady().then(()=>{});app.on('window-all-closed',()=>{});\n");
    const guardData = await mkdtemp(path.join(workspace, 'guard-'));
    guard = await electron.launch({ args: [guardFile], env: envFor(guardData), timeout: 30000 });
    const backup = await guard.evaluate(async ({ clipboard, ClipboardItem, nativeImage, app }) => {
      await app.whenReady();
      const saved = [], originalValues = [];
      for (const item of await clipboard.read()) {
        const values = {};
        for (const type of item.types) values[type] = await item.getType(type);
        if (Object.keys(values).length) { saved.push(new ClipboardItem(values)); originalValues.push(values); }
      }
      globalThis.__clipboardBackup = saved;
      globalThis.__clipboardOriginalValues = originalValues;
      const width = 2560, height = 1440, data = Buffer.alloc(width * height * 4);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        data[offset] = x % 256; data[offset + 1] = y % 256; data[offset + 2] = (x ^ y) % 256; data[offset + 3] = 255;
      }
      globalThis.__fixturePng = nativeImage.createFromBitmap(data, { width, height }).toPNG();
      globalThis.__fixtureBitmap = data;
      return Promise.all(originalValues.map(async values => Object.fromEntries(await Promise.all(Object.entries(values).map(async ([type, value]) =>
        [type, value instanceof Blob ? { kind: 'blob', data: Buffer.from(await value.arrayBuffer()).toString('base64') } : { kind: 'value', data: value }]
      )))));
    });
    await writeFile(clipboardBackupFile, JSON.stringify(backup), { mode: 0o600 });
    report.clipboardBackup = clipboardBackupFile;
    for (let i = 0; i < resourceRuns; i++) for (const scenario of ['home', 'hidden', 'image', 'json']) {
      for (const label of i % 2 ? ['after', 'before'] : ['before', 'after']) await resourceRun(label, scenario, i, guard);
    }
  }
} catch (error) {
  report.error = error.stack || String(error);
  process.exitCode = 1;
  console.error(error);
} finally {
  if (guard) {
    try {
      report.clipboardRestored = await guard.evaluate(async ({ clipboard, nativeImage }) => {
        if (!globalThis.__clipboardBackup) return 'not modified';
        if (globalThis.__lastFixture) {
          let matches;
          if (globalThis.__lastFixture === 'text') matches = await clipboard.readText() === 'Nexlet performance fixture 2026-10-12';
          else {
            const item = (await clipboard.read()).find(item => item.types.includes('image/png'));
            const image = item ? nativeImage.createFromBuffer(Buffer.from(await (await item.getType('image/png')).arrayBuffer())) : null;
            matches = image?.getSize().width === 2560 && image?.getSize().height === 1440 && image.toBitmap().equals(globalThis.__fixtureBitmap);
          }
          if (!matches) return 'skipped: user clipboard changed; newer contents preserved';
        }
        if (globalThis.__clipboardBackup.length) await clipboard.write(globalThis.__clipboardBackup);
        else clipboard.clear();
        const restored = await clipboard.read();
        for (let i = 0; i < globalThis.__clipboardOriginalValues.length; i++) {
          for (const [type, original] of Object.entries(globalThis.__clipboardOriginalValues[i])) {
            const actual = await restored[i]?.getType(type);
            let same;
            if (original instanceof Blob && actual instanceof Blob) {
              const actualBytes = Buffer.from(await actual.arrayBuffer()), originalBytes = Buffer.from(await original.arrayBuffer());
              same = actualBytes.equals(originalBytes);
              // macOS may synthesize a differently encoded PNG after writing.
              if (!same && (type === 'image/png' || type.includes('Apple PNG pasteboard type'))) {
                const a = nativeImage.createFromBuffer(actualBytes), b = nativeImage.createFromBuffer(originalBytes);
                same = !a.isEmpty() && !b.isEmpty() && a.getSize().width === b.getSize().width && a.getSize().height === b.getSize().height && a.toBitmap().equals(b.toBitmap());
              }
            } else same = JSON.stringify(actual) === JSON.stringify(original);
            if (!same) throw Error('Clipboard read-back mismatch for format ' + type);
          }
        }
        if (!globalThis.__clipboardBackup.length && restored.length) throw Error('Clipboard did not clear');
        return 'restored and read-back verified';
      });
      if (report.clipboardRestored === 'restored and read-back verified') {
        await unlink(clipboardBackupFile);
        report.clipboardBackup = 'removed after verified restoration';
      }
    } catch (error) { report.clipboardRestoreError = String(error); process.exitCode = 1; }
    await guard.close();
  }
  await save();
}
