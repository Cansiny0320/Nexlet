import type { AppState } from '../shared/types';

/** IPC clones arrays. Keep search inputs stable across unrelated state changes. */
export function retainSearchInputs(current: AppState | null, next: AppState): AppState {
  if (!current) return next;
  if (current.catalogRevision > next.catalogRevision) return current;
  const same = <T>(previous: T, value: T) =>
    JSON.stringify(previous) === JSON.stringify(value) ? previous : value;
  return {
    ...next,
    commands: same(current.commands, next.commands),
    recent: same(current.recent, next.recent),
  };
}
