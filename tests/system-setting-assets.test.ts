import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { expect, it } from 'vite-plus/test';
import { systemCommands } from '../src/main/system-commands';

it('all system artwork is distinct, decodable and transparent at the edges', async () => {
  const ids = new Set(
    [
      ...systemCommands('win32', '10.0.19045'),
      ...systemCommands('win32', '10.0.22631'),
      ...systemCommands('darwin', '22.0.0'),
    ]
      .filter((c) => c.kind === 'system')
      .map((c) => c.id),
  );
  const hashes = new Set<string>();
  for (const id of ids) {
    const [, group, name] = id.split(':');
    const directory = group === 'action' ? 'system-actions' : 'system-settings';
    const file = await readFile(new URL(`../assets/${directory}/${name}.png`, import.meta.url));
    const hash = createHash('sha256').update(file).digest('hex');
    expect(hashes.has(hash), id).toBe(false);
    hashes.add(hash);
    const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
    expect(info, id).toMatchObject({ width: 128, height: 128, channels: 4 });
    let visible = 0;
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++) {
        const alpha = data[(y * info.width + x) * 4 + 3];
        if (alpha > 240) visible++;
        if (x === 0 || y === 0 || x === info.width - 1 || y === info.height - 1)
          expect(alpha, id).toBe(0);
      }
    expect(visible, id).toBeGreaterThan(info.width * info.height * 0.1);
  }
});
