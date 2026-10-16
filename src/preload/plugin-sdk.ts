import { localeBridge } from './locale';
import { ipcRenderer } from 'electron';
import type { PluginSdkExtensions, PluginInputExtensions, PluginClipboardExtensions } from '../shared/plugin-api';
export const invoke = (method: string, args?: unknown) => ipcRenderer.invoke('plugin-api', method, args);
export const onSdkEvent = (event: string, callback: (value: any) => void) => {
  if (typeof callback !== 'function') throw new Error('事件回调无效');
  const listener = (_: Electron.IpcRendererEvent, message: { event: string; value: unknown }) => { if (message.event === event) callback(message.value); };
  ipcRenderer.on('plugin-sdk-event', listener); return () => ipcRenderer.removeListener('plugin-sdk-event', listener);
};
export const sdk: PluginSdkExtensions = {
  i18n: { getLocale: localeBridge.get, onChange: localeBridge.onChange },
  window: { info: window => invoke('window.info', { window }), show: window => invoke('window.show', { window }), hide: window => invoke('window.hide', { window }), focus: window => invoke('window.focus', { window }), close: window => invoke('window.close', { window }), detach: () => invoke('window.detach'), set: (options, window) => invoke('window.set', { options, window }), create: options => invoke('window.create', options), send: (message, window) => invoke('window.send', { message, window }), onMessage: callback => onSdkEvent('window.message', callback), onClosed: callback => onSdkEvent('window.closed', callback) },
  commands: { list: () => invoke('commands.list'), set: features => invoke('commands.set', { features }), redirect: options => invoke('commands.redirect', options) },
  search: { returnToLauncher: text => invoke('search.returnToLauncher', text), set: options => invoke('search.set', options), results: results => invoke('search.results', results), onChange: callback => onSdkEvent('search.change', callback), onSelect: callback => onSdkEvent('search.select', callback) },
  browser: { create: options => invoke('browser.create', options), perform: options => invoke('browser.perform', options), close: browser => invoke('browser.close', { browser }), onClosed: callback => onSdkEvent('browser.closed', callback), onDownload: callback => onSdkEvent('browser.download', callback) },
  media: { image: options => invoke('media.image', options), ffmpeg: options => invoke('media.ffmpeg', options) },
  ai: { configure: config => invoke('ai.configure', config), status: () => invoke('ai.status'), models: options => invoke('ai.models', options), chat: options => invoke('ai.chat', options), onChunk: callback => onSdkEvent('ai.chunk', callback) },
  services: { configure: config => invoke('services.configure', config), status: () => invoke('services.status'), account: options => invoke('services.account', options), login: options => invoke('services.login', options), loginStatus: options => invoke('services.loginStatus', options), license: options => invoke('services.license', options), checkout: options => invoke('services.checkout', options), syncGet: options => invoke('services.syncGet', options), syncPut: options => invoke('services.syncPut', options) },
  tools: { register: definition => invoke('tools.register', definition), list: () => invoke('tools.list'), remove: name => invoke('tools.remove', name), call: options => invoke('tools.call', options) },
  mcp: { start: () => invoke('mcp.start'), stop: () => invoke('mcp.stop') },
  system: { info: () => invoke('system.info'), path: name => invoke('system.path', name), fileIcon: path => invoke('system.fileIcon', { path }), openPath: path => invoke('system.openPath', { path }), reveal: path => invoke('system.reveal', { path }), trash: path => invoke('system.trash', { path }) },
  files: { read: path => invoke('files.read', { path }), write: (path, data, overwrite) => invoke('files.write', { path, data, overwrite }), stat: path => invoke('files.stat', { path }), list: path => invoke('files.list', { path }), mkdir: (path, recursive) => invoke('files.mkdir', { path, recursive }), rename: (path, to) => invoke('files.rename', { path, to }), copy: (path, to, overwrite) => invoke('files.copy', { path, to, overwrite }), remove: path => invoke('files.remove', { path }) },
  process: { run: request => invoke('process.run', request) },
  dialogs: { message: options => invoke('dialogs.message', options), open: options => invoke('dialogs.open', options), save: options => invoke('dialogs.save', options) },
  notifications: { show: options => invoke('notifications.show', options), onClick: callback => onSdkEvent('notification', callback) },
  screen: { displays: () => invoke('screen.displays'), cursor: () => invoke('screen.cursor'), convertPoint: (point, to) => invoke('screen.convertPoint', { point, to }), sources: () => invoke('screen.sources'), capture: options => invoke('screen.capture', options), select: options => invoke('screen.select', options), pickColor: options => invoke('screen.pickColor', options) },
  tasks: { cancel: id => invoke('tasks.cancel', id), onProgress: callback => onSdkEvent('progress', callback) },
  database: {
    get: id => invoke('database.get', { id }), put: document => invoke('database.put', document), bulk: documents => invoke('database.bulk', { documents }),
    query: options => invoke('database.query', options), remove: (id, rev) => invoke('database.remove', { id, rev }),
    getAttachment: (id, name) => invoke('database.getAttachment', { id, name }),
    putAttachment: (id, rev, name, mime, data) => invoke('database.putAttachment', { id, rev, name, mime, data }),
    removeAttachment: (id, rev, name) => invoke('database.removeAttachment', { id, rev, name })
  },
  backend: { call: request => invoke('backend.call', request), stop: () => invoke('backend.stop') },
  schedules: { list: () => invoke('schedules.list'), set: schedule => invoke('schedules.set', schedule), remove: id => invoke('schedules.remove', id) }
};
export const inputExtensions: PluginInputExtensions = { paste: () => invoke('input.paste'), key: options => invoke('input.key', options), mouse: options => invoke('input.mouse', options), drag: options => invoke('input.drag', options) };
export const clipboardExtensions: PluginClipboardExtensions = { snapshot: () => invoke('clipboard.snapshot'), writeTextIfUnchanged: (token, text) => invoke('clipboard.writeTextIfUnchanged', { token, text }), readImage: () => invoke('clipboard.readImage'), writeImage: data => invoke('clipboard.writeImage', data), readFiles: () => invoke('clipboard.readFiles'), writeFiles: files => invoke('clipboard.writeFiles', files) };
