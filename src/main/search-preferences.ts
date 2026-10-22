import type { Command } from '../shared/types';
import type { InputSource } from '../shared/launch';
import { searchCommands } from '../shared/search';
interface Storage {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
}
interface Entry {
  query: string;
  weights: Record<string, number>;
}
export class SearchPreferences {
  revision = 0;
  private entries: Entry[];
  constructor(private store: Storage) {
    this.entries = store.get('search-preferences', []);
  }
  weights(query: string) {
    return this.entries.find((entry) => entry.query === query.trim().toLowerCase())?.weights || {};
  }
  learn(query: string, source: InputSource, command: Command) {
    const key = query.trim().toLowerCase();
    if (
      source !== 'input' ||
      key.length > 60 ||
      !key ||
      !/^[\p{L}\p{N} _-]+$/u.test(key) ||
      key.split(/\s+/).length > 3 ||
      command.kind === 'match' ||
      !searchCommands([command], key).length
    )
      return;
    const entry = this.entries.find((entry) => entry.query === key) || { query: key, weights: {} };
    entry.weights[command.id] = Math.min(80, (entry.weights[command.id] || 0) + 10);
    entry.weights = Object.fromEntries(
      Object.entries(entry.weights)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8),
    );
    this.entries = [entry, ...this.entries.filter((item) => item !== entry)].slice(0, 200);
    this.save();
  }
  clear() {
    this.entries = [];
    this.save();
  }
  private save() {
    this.store.set('search-preferences', this.entries);
    this.revision++;
  }
}
