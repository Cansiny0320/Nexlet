import { parentPort, workerData } from 'node:worker_threads';
import { Store } from './store';
import { setLocale } from '../shared/i18n';
import type { ClipboardRequest, ClipboardResponse } from './clipboard-store';

const port = parentPort!;
const store = new Store(workerData.directory);
let closed = false;
function backfill() {
  if (closed) return;
  if (store.backfillClips()) setImmediate(backfill);
}
setImmediate(backfill);
port.on('message', (request: ClipboardRequest) => {
  const response: ClipboardResponse = { id: request.id };
  try {
    setLocale(request.locale);
    if (closed) throw Error('Clipboard store closed');
    if (request.method === 'close') {
      closed = true;
      store.close();
    } else {
      if (request.query) {
        const { signal, version } = request.query;
        const view = new Int32Array(signal);
        store.queryIsCurrent = () => Atomics.load(view, 0) === version;
        if (!store.queryIsCurrent()) throw Error('Clipboard query superseded');
      }
      const method = store[request.method] as (...args: unknown[]) => unknown;
      response.value = method.apply(store, request.args);
    }
  } catch (error) {
    response.error = error instanceof Error ? error.message : String(error);
  } finally {
    store.queryIsCurrent = undefined;
  }
  port.postMessage(response);
  if (closed) port.close();
});
