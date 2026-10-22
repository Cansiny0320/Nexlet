import type { ClipItem } from './types';

export const CLIP_PAGE_SIZE = 40;
export interface ClipSummary extends Omit<ClipItem, 'hash' | 'html' | 'ocrText'> {
  textLength: number;
  hasHtml?: boolean;
  hasOcr?: boolean;
}
export interface ClipIndex {
  ids: string[];
  revision: number;
}
export interface ClipPage {
  items: ClipSummary[];
  revision: number;
  stale?: boolean;
}

export const textClipboardHash = (text: string, html?: string) =>
  html ? 'html:' + JSON.stringify([text, html]) : 'text:' + text;
export function shouldRecordClipboard(
  settings: {
    clipboardEnabled: boolean;
    clipboardPausedUntil: number;
    clipboardExcludedApps: string[];
  },
  source: { app: string; name?: string } | null,
  now = Date.now(),
) {
  return (
    settings.clipboardEnabled &&
    !(settings.clipboardPausedUntil > now) &&
    !settings.clipboardExcludedApps.some((value) =>
      [source?.app, source?.name].some((name) => name?.toLowerCase() === value.toLowerCase()),
    )
  );
}
