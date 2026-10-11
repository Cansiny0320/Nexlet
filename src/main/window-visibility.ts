import type { BrowserWindow } from 'electron';

/** A one-time foreground request must not change the user's always-on-top choice. */
export function revealWindow(window: BrowserWindow): void {
  if (window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.moveTop();
  window.focus();
}

export function focusOnRestore(window: BrowserWindow): void {
  window.on('restore', () => {
    if (window.isDestroyed()) return;
    window.moveTop();
    window.focus();
  });
}
