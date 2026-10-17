import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Asset packaging only: extract the approved imagegen artwork, trim transparent
// margins and normalize its optical footprint. No drawing or recoloring.
const sourceDirectory = new URL('../assets/artwork/system-settings/', import.meta.url);
const outputDirectory = new URL('../assets/system-settings/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', sourceDirectory), 'utf8'));
const source = fileURLToPath(new URL(manifest.source, sourceDirectory));
const metadata = await sharp(source).metadata();
if (metadata.width !== manifest.width || metadata.height !== manifest.height || !metadata.hasAlpha) {
  throw new Error('Approved atlas dimensions/alpha do not match the extraction manifest');
}
await mkdir(outputDirectory, { recursive: true });
for (const { id, left, top, width, height } of manifest.icons) {
  const cell = sharp(source).extract({ left, top, width, height });
  const { data, info } = await cell.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const alpha = data[(y * width + x) * info.channels + 3];
    if (alpha < 16) continue;
    if (alpha > 64 && (x === 0 || y === 0 || x === width - 1 || y === height - 1)) {
      throw new Error(`Extraction boundary cuts into ${id}`);
    }
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  if (maxX < minX) throw new Error(`Empty artwork: ${id}`);
  minX = Math.max(0, minX - 2); minY = Math.max(0, minY - 2);
  maxX = Math.min(width - 1, maxX + 2); maxY = Math.min(height - 1, maxY + 2);
  const innerSize = manifest.size - 2 * manifest.padding;
  const output = await sharp(source).extract({ left: left + minX, top: top + minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .resize(innerSize, innerSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ top: manifest.padding, bottom: manifest.padding, left: manifest.padding, right: manifest.padding, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 }).toBuffer();
  await sharp(output).toFile(fileURLToPath(new URL(`${id}.png`, outputDirectory)));
}
console.log(`Prepared ${manifest.icons.length} transparent system-setting icons at ${manifest.size}px`);
