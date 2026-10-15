import { ipcRenderer } from 'electron';
import type { Locale } from '../shared/i18n';
export const localeBridge = Object.freeze({
  get: (): Promise<Locale> => ipcRenderer.invoke('app-locale'),
  onChange: (callback: (locale: Locale) => void) => {
    const listener = (_event: unknown, locale: Locale) => callback(locale);
    ipcRenderer.on('app-locale', listener);
    return () => ipcRenderer.removeListener('app-locale', listener);
  },
});
