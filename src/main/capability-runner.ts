import { t } from '../shared/i18n';
import { BrowserWindow, session } from 'electron';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { CapabilityRunner } from './capability-providers';
import type { AIModels } from './ai-models';
import type { AIRequest } from '../shared/ai';
import { configurePluginSession } from './plugin-session';
import { PluginNetwork } from './plugin-network';
import type { Fetcher } from './plugin-sdk/providers';

/** A fresh sandbox and partition per call keep providers from accessing another call's image. */
export function capabilityRunner(ai: AIModels, fetcher: Fetcher): CapabilityRunner {
  const network = new PluginNetwork(fetcher);
  return async (record, definition, request, config, signal, progress) => {
    signal.throwIfAborted();
    const partition = 'nexlet-provider-' + randomUUID(),
      isolated = session.fromPartition(partition);
    configurePluginSession(isolated, record);
    const window = new BrowserWindow({
      show: false,
      focusable: false,
      skipTaskbar: true,
      width: 1,
      height: 1,
      webPreferences: {
        partition,
        preload: path.join(__dirname, '../preload/capability.cjs'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
        backgroundThrottling: false,
        devTools: false,
      },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    window.webContents.on('will-attach-webview', (event) => event.preventDefault());
    const owner = window.webContents.id;
    return new Promise((resolve, reject) => {
      let done = false,
        started = false,
        pending = 0;
      const controller = new AbortController(),
        combined = AbortSignal.any([signal, controller.signal]);
      const finish = (error?: Error, value?: unknown) => {
        if (done) return;
        done = true;
        signal.removeEventListener('abort', cancel);
        controller.abort();
        network.close(owner);
        if (!window.isDestroyed()) window.destroy();
        isolated.protocol.unhandle('nexlet-plugin');
        error ? reject(error) : resolve(value);
      };
      const cancel = () => finish(new Error(t('提供商请求已取消或超时')));
      signal.addEventListener('abort', cancel, { once: true });
      window.once('closed', () => finish(new Error(t('提供商已关闭'))));
      window.webContents.once('render-process-gone', () =>
        finish(new Error(t('提供商进程异常退出'))),
      );
      window.webContents.on('ipc-message', (event, channel, value) => {
        if (done || event.senderFrame !== window.webContents.mainFrame) return;
        if (channel === 'capability:ready' && !started) {
          started = true;
          window.webContents.send('capability:run', { request, config, providerId: definition.id });
        } else if (channel === 'capability:progress' && typeof value === 'number') progress(value);
        else if (channel === 'capability:result') finish(undefined, value);
        else if (channel === 'capability:error')
          finish(new Error(typeof value === 'string' ? value.slice(0, 1000) : t('提供商调用失败')));
        else if (
          channel === 'capability:call' &&
          value &&
          typeof value.id === 'string' &&
          value.id.length <= 80
        ) {
          const call = async () => {
            if (definition.locality !== 'cloud') throw new Error(t('本地提供商不能访问云服务'));
            if (pending >= 4) throw new Error(t('提供商并发请求过多'));
            pending++;
            try {
              if (value.method === 'ai' && record.manifest.permissions.includes('ai'))
                return ai.generate(value.args as AIRequest, combined, () => {});
              if (
                value.method === 'network' &&
                record.manifest.permissions.includes('network.request')
              )
                return network.request(owner, { ...value.args, id: value.id });
              throw new Error(t('提供商未获授权'));
            } finally {
              pending--;
            }
          };
          void call().then(
            (result) => {
              if (!done) window.webContents.send('capability:reply', { id: value.id, result });
            },
            (error) => {
              if (!done)
                window.webContents.send('capability:reply', {
                  id: value.id,
                  error: error instanceof Error ? error.message : t('调用失败'),
                });
            },
          );
        }
      });
      void window
        .loadURL(`nexlet-plugin://${record.manifest.id}/${definition.entry}`)
        .catch((error) => finish(error));
      if (signal.aborted) cancel();
    });
  };
}
