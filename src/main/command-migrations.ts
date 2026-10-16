import type { CommandConfig } from '../shared/command-config';

const OCR_COMMANDS: Record<string, string> = {
  'tool:ocr': 'plugin:org.nexlet.ocr:recognize',
  'ocr:image-copy': 'plugin:org.nexlet.ocr:copy',
  'capture:ocr': 'plugin:org.nexlet.ocr:capture',
  'capture:ocr-copy': 'plugin:org.nexlet.ocr:capture-copy'
};
export const migrateCommandId = (id: string): string => Object.hasOwn(OCR_COMMANDS,id) ? OCR_COMMANDS[id] : id;
export const migrateCommandIds = (ids: string[]): string[] => [...new Set(ids.map(migrateCommandId))];
export function migrateCommandConfig(previous: CommandConfig): CommandConfig {
  const next = structuredClone(previous);
  for (const [oldId, newId] of Object.entries(OCR_COMMANDS)) {
    if (previous.commands[oldId] && !previous.commands[newId]) next.commands[newId] = structuredClone(previous.commands[oldId]);
  }
  if (next.pinned) next.pinned = migrateCommandIds(next.pinned);
  if (JSON.stringify(next) === JSON.stringify(previous)) return previous;
  next.revision++;
  return next;
}
