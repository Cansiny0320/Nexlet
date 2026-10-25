import { describe, it, expect } from 'vite-plus/test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { readPluginZip } from '../src/main/plugin-bundle';
import { validateMarketIndex } from '../src/shared/marketplace';

const directory = path.resolve(process.env.NEXLET_PLUGINS_DIR ?? '../Nexlet-plugins', 'dist');
const plugins = ['ai-actions', 'translate', 'ocr', 'pdf-tools', 'image-batch', 'batch-rename'];
describe.skipIf(plugins.some((id) => !existsSync(path.join(directory, id + '.nexlet'))))(
  'built alignment packages pass the real host installer parser',
  () => {
    it.skipIf(!existsSync(path.join(directory, 'index.json')))(
      'candidate marketplace catalog accepts the built plugin metadata',
      () => {
        const index = validateMarketIndex(
          JSON.parse(readFileSync(path.join(directory, 'index.json'), 'utf8')),
        );
        for (const id of plugins)
          expect(index.plugins.some((entry) => entry.id === 'org.nexlet.' + id)).toBe(true);
      },
    );
    it.each(plugins)('%s contains valid entry points and permissions', (id) => {
      const bundle = readPluginZip(readFileSync(path.join(directory, id + '.nexlet')));
      expect(bundle.manifest.id).toBe('org.nexlet.' + id);
      expect(JSON.parse(bundle.files.get('plugin.json')!.toString()).minHostVersion).toBe('0.2.47');
    });
  },
);
