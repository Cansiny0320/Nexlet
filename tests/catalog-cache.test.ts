import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { CatalogCache, type CatalogSnapshot } from '../src/main/catalog-cache';

const directories: string[] = [];
const caches: CatalogCache[] = [];
const icon = (value: string) => 'data:image/png;base64,' + Buffer.from(value).toString('base64');
const fingerprint = 'a'.repeat(64);
const snapshot = (): CatalogSnapshot => ({
  context: 'win32:zh-CN:menu',
  items: [{ id: 'app:editor', name: 'Editor', kind: 'shortcut', path: 'C:/Menu/Editor.lnk', subtitle: 'Menu', keywords: ['Editor desktop'] }],
  aliases: [['app:desktop', 'app:editor']], iconSources: [], fingerprints: [['app:editor', fingerprint]],
});
function directory() { const dir = mkdtempSync(path.join(tmpdir(), 'nexlet-catalog-cache-')); directories.push(dir); return dir; }
function open(dir: string, budget?: number) { const cache = new CatalogCache(dir, budget); caches.push(cache); return cache; }
afterEach(() => {
  for (const cache of caches.splice(0)) cache.close();
  for (const dir of directories.splice(0)) {
    if (!path.resolve(dir).startsWith(path.join(tmpdir(), 'nexlet-catalog-cache-'))) throw Error('Unexpected fixture path');
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('catalog disk cache', () => {
  it('invalidates pre-native icons on upgrade while retaining the catalog and newly loaded icons', () => {
    const dir = directory(), first = open(dir), saved = snapshot();
    first.save(saved); first.setIcon('app:editor', fingerprint, icon('old-generic')); first.close();
    const legacy = new DatabaseSync(path.join(dir, 'catalog-cache.sqlite'));
    legacy.exec('PRAGMA user_version=1'); legacy.close();
    const upgraded = open(dir);
    expect(upgraded.load(saved.context)).toEqual(saved);
    expect(upgraded.getIcon('app:editor', fingerprint)).toBeUndefined();
    upgraded.setIcon('app:editor', fingerprint, icon('native')); upgraded.close();
    const restarted = open(dir);
    expect(restarted.load(saved.context)).toEqual(saved);
    expect(restarted.getIcon('app:editor', fingerprint)).toBe(icon('native'));
  });
  it('restores the directory, aliases and loaded icons across database reopen', () => {
    const dir = directory(), first = open(dir), saved = snapshot();
    first.save(saved); first.setIcon('app:editor', fingerprint, icon('editor')); first.close();
    const second = open(dir);
    expect(second.load(saved.context)).toEqual(saved);
    expect(second.getIcon('app:editor', fingerprint)).toBe(icon('editor'));
    expect(second.getIcon('app:editor', 'b'.repeat(64))).toBeUndefined();
    expect(second.load('win32:en:other-path')).toBeUndefined();
  });

  it('rejects incompatible and malformed snapshots without affecting the user database', () => {
    const dir = directory();
    writeFileSync(path.join(dir, 'nexlet.sqlite'), 'user data sentinel');
    const first = open(dir); first.save(snapshot()); first.close();
    const db = new DatabaseSync(path.join(dir, 'catalog-cache.sqlite'));
    for (const value of ['{broken', JSON.stringify({ version: 99, ...snapshot() }), JSON.stringify({ version: 1, ...snapshot(), items: [{ id: 'bad' }] })]) {
      db.prepare('UPDATE snapshot SET value=? WHERE id=1').run(value);
      const cache = open(dir); expect(cache.load(snapshot().context)).toBeUndefined(); cache.close();
    }
    db.close();
    expect(readFileSync(path.join(dir, 'nexlet.sqlite'), 'utf8')).toBe('user data sentinel');
  });

  it('rebuilds a corrupt cache and degrades harmlessly when storage cannot be opened', () => {
    const dir = directory();
    writeFileSync(path.join(dir, 'catalog-cache.sqlite'), 'not a database');
    const cache = open(dir); cache.save(snapshot());
    expect(cache.load(snapshot().context)).toEqual(snapshot());
    const blocked = path.join(dir, 'not-a-directory'); writeFileSync(blocked, 'file');
    const unavailable = open(blocked);
    expect(() => { unavailable.save(snapshot()); unavailable.setIcon('app:editor', fingerprint, icon('x')); }).not.toThrow();
    expect(unavailable.load(snapshot().context)).toBeUndefined();
  });

  it('evicts least recently used icons and removes changed/deleted entries on snapshot commit', () => {
    const cache = open(directory(), 60);
    cache.setIcon('app:editor', fingerprint, icon('1'));
    cache.setIcon('app:second', fingerprint, icon('2'));
    cache.getIcon('app:editor', fingerprint);
    cache.setIcon('app:third', fingerprint, icon('3'));
    expect(cache.getIcon('app:second', fingerprint)).toBeUndefined();
    expect(cache.getIcon('app:editor', fingerprint)).toBe(icon('1'));
    cache.save(snapshot());
    expect(cache.getIcon('app:third', fingerprint)).toBeUndefined();
    cache.save({ ...snapshot(), fingerprints: [['app:editor', 'b'.repeat(64)]] });
    expect(cache.getIcon('app:editor', fingerprint)).toBeUndefined();
  });

  it('does not persist failed, non-image or oversized icon results', () => {
    const cache = open(directory());
    for (const data of ['', 'file:///private.png', icon('x'.repeat(512 * 1024))]) {
      cache.setIcon('app:editor', fingerprint, data);
      expect(cache.getIcon('app:editor', fingerprint)).toBeUndefined();
    }
    cache.close();
    expect(() => cache.save(snapshot())).not.toThrow();
  });
});
