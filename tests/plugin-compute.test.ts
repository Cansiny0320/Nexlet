import { expect, it } from 'vite-plus/test';
import AdmZip from 'adm-zip';
import { pluginCsp } from '../src/shared/plugin-policy';
import { validateManifest } from '../src/shared/plugin-validation';
import { readPluginZip } from '../src/main/plugin-bundle';

it('allows local compute only for plugins declaring the permission, without network or Node access', () => {
  const normal = pluginCsp([]),
    compute = pluginCsp(['runtime.compute']);
  expect(normal).not.toContain('unsafe-eval');
  expect(normal).toContain("connect-src 'none'");
  expect(compute).toContain("script-src 'self' 'unsafe-eval'");
  expect(compute).toContain("worker-src 'self'");
  expect(compute).toContain("connect-src 'self' data:");
  expect(compute).not.toMatch(/https?:|\*/);
  expect(
    validateManifest({
      id: 'org.test.compute',
      name: 'Compute',
      version: '1.0.0',
      apiVersion: 1,
      main: 'index.html',
      permissions: ['runtime.compute'],
      features: [{ code: 'main', name: 'Main', keywords: [] }],
    }).permissions,
  ).toContain('runtime.compute');
});

it('accepts an offline model above the old limit, but rejects oversized files before extraction', () => {
  const zip = new AdmZip();
  zip.addFile(
    'plugin.json',
    Buffer.from(
      JSON.stringify({
        id: 'org.test.compute',
        name: 'Compute',
        version: '1.0.0',
        apiVersion: 1,
        main: 'index.html',
        permissions: ['runtime.compute'],
        features: [{ code: 'main', name: 'Main', keywords: [] }],
      }),
    ),
  );
  zip.addFile('index.html', Buffer.from('<!doctype html>'));
  zip.addFile('model.tar', Buffer.alloc(21 * 1024 * 1024));
  expect(readPluginZip(zip.toBuffer()).files.get('model.tar')?.length).toBe(21 * 1024 * 1024);
  zip.addFile('model.tar', Buffer.alloc(33 * 1024 * 1024));
  expect(() => readPluginZip(zip.toBuffer())).toThrow('解压大小超过限制');
});
