import { t, setLocale, type Locale } from '../../shared/i18n';
import { pathToFileURL } from 'node:url';
import type { BackendHandlers } from '../../shared/plugin-api';

setLocale(process.argv[4] as Locale);
const jobs = new Map<string, AbortController>();
const modulePromise = import(pathToFileURL(process.argv[2]).href).then(module => {
  const handlers = module.handlers ?? module.default?.handlers;
  if (!handlers || typeof handlers !== 'object') throw new Error(t("backend 必须导出 handlers"));
  return handlers as BackendHandlers;
});
process.parentPort.on('message', ({ data }) => {
  if (data.locale) setLocale(data.locale);
  if (data.type === 'cancel') { jobs.get(data.id)?.abort(new Error(t("任务已取消"))); return; }
  if (data.type !== 'call') return;
  const controller = new AbortController(); jobs.set(data.id, controller);
  void modulePromise.then(async handlers => {
    if (!Object.hasOwn(handlers, data.method) || typeof handlers[data.method] !== 'function') throw new Error(t("backend 方法不存在"));
    controller.signal.throwIfAborted();
    const result = await handlers[data.method](data.args, { signal: controller.signal, dataDirectory: process.argv[3], emit: value => {
      if (!controller.signal.aborted) process.parentPort.postMessage({ type: 'progress', id: data.id, value });
    } });
    controller.signal.throwIfAborted();
    process.parentPort.postMessage({ type: 'result', id: data.id, value: result });
  }).catch(error => process.parentPort.postMessage({ type: 'error', id: data.id, error: String(error?.message || error) }))
    .finally(() => jobs.delete(data.id));
});
// A failed import must not become an unhandled rejection while no RPC is in flight.
void modulePromise.catch(() => {});
