import { expect, it } from 'vite-plus/test';
import { pluginConsentChanges } from '../src/shared/plugin-consent';
import { validateManifest } from '../src/shared/plugin-validation';
const manifest = validateManifest({
  id: 'org.test.plugin',
  name: 'Test',
  version: '1.0.0',
  apiVersion: 1,
  main: 'index.html',
  permissions: ['ai'],
  features: [{ code: 'open', name: 'Open', keywords: [] }],
  providers: [
    {
      id: 'ocr',
      name: 'OCR',
      capability: 'ocr',
      locality: 'local',
      languages: ['en'],
      entry: 'provider.html',
    },
  ],
});
it('requires renewed consent for new permissions and local-to-cloud provider changes', () => {
  expect(pluginConsentChanges(manifest, { ...manifest, version: '2.0.0' })).toEqual([]);
  expect(pluginConsentChanges(manifest, { ...manifest, permissions: ['ai', 'backend'] })).toEqual([
    '权限：backend',
  ]);
  expect(
    pluginConsentChanges(manifest, {
      ...manifest,
      providers: manifest.providers!.map((p) => ({ ...p, locality: 'cloud' })),
    }),
  ).toEqual(['提供商将使用云端：OCR']);
});
