import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Package imagegen originals without drawing, recoloring or changing their alpha.
const sourceDirectory = new URL('../assets/artwork/system-actions/', import.meta.url);
const outputDirectory = new URL('../assets/system-actions/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', sourceDirectory), 'utf8'));
await mkdir(outputDirectory, { recursive: true });
for (const { id, source } of manifest.icons) {
  const original = await readFile(new URL(source, sourceDirectory));
  const { data, info } = await sharp(original)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (!(await sharp(original).metadata()).hasAlpha) throw new Error(`Missing transparency: ${id}`);
  let minX = info.width,
    minY = info.height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * info.channels + 3] < 16) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  if (maxX < minX) throw new Error(`Empty artwork: ${id}`);
  minX = Math.max(0, minX - 2);
  minY = Math.max(0, minY - 2);
  maxX = Math.min(info.width - 1, maxX + 2);
  maxY = Math.min(info.height - 1, maxY + 2);
  const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
  await sharp(original)
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .resize(manifest.size - 2 * manifest.padding, manifest.size - 2 * manifest.padding, {
      fit: 'contain',
      background: transparent,
    })
    .extend({
      top: manifest.padding,
      bottom: manifest.padding,
      left: manifest.padding,
      right: manifest.padding,
      background: transparent,
    })
    .png({ compressionLevel: 9 })
    .toFile(fileURLToPath(new URL(`${id}.png`, outputDirectory)));
}
console.log(
  `Prepared ${manifest.icons.length} transparent system-action icons at ${manifest.size}px`,
);
