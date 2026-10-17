const { app, nativeImage } = require('electron');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const tools = ['filesearch', 'clipboard', 'timestamp', 'web', 'scratchpad', 'plugins', 'json'];

// Packaging only: trim transparent margins, retain the approved artwork, and
// give every icon the same optical footprint with a 3% transparent safe area.
function normalize(file, size) {
  const source = nativeImage.createFromPath(file);
  if (source.isEmpty()) throw new Error(`Cannot read artwork: ${file}`);
  const { width, height } = source.getSize();
  const pixels = source.toBitmap();
  let left = width,
    top = height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] < 16) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  if (right < left) throw new Error(`Artwork is fully transparent: ${file}`);
  if (
    [0, (width - 1) * 4, (height - 1) * width * 4, (width * height - 1) * 4].some(
      (i) => pixels[i + 3] > 0,
    )
  ) {
    throw new Error(`Artwork must have transparent corners: ${file}`);
  }
  const cropped = source.crop({
    x: left,
    y: top,
    width: right - left + 1,
    height: bottom - top + 1,
  });
  const scale =
    (size - 2 * Math.max(1, Math.round(size * 0.03))) /
    Math.max(right - left + 1, bottom - top + 1);
  const w = Math.max(1, Math.round((right - left + 1) * scale));
  const h = Math.max(1, Math.round((bottom - top + 1) * scale));
  const resized = cropped.resize({ width: w, height: h, quality: 'best' }).toBitmap();
  const output = Buffer.alloc(size * size * 4);
  const x = Math.floor((size - w) / 2),
    y = Math.floor((size - h) / 2);
  for (let row = 0; row < h; row++)
    resized.copy(output, ((y + row) * size + x) * 4, row * w * 4, (row + 1) * w * 4);
  return nativeImage.createFromBitmap(output, { width: size, height: size }).toPNG();
}

function windowsIcon(frames) {
  const header = Buffer.alloc(6 + frames.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  let offset = header.length;
  frames.forEach(({ size, png }, i) => {
    const entry = 6 + i * 16;
    header[entry] = header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...frames.map((frame) => frame.png)]);
}

app
  .whenReady()
  .then(() => {
    const artwork = (name) => path.resolve('assets/artwork', `${name}.png`);
    mkdirSync('assets/tools', { recursive: true });
    writeFileSync('assets/icon.png', normalize(artwork('logo'), 512));
    writeFileSync('assets/brand.png', normalize(artwork('logo'), 128));
    writeFileSync(
      'assets/icon.ico',
      windowsIcon(
        [16, 24, 32, 48, 64, 128, 256].map((size) => ({
          size,
          png: normalize(artwork('logo'), size),
        })),
      ),
    );
    for (const name of tools)
      writeFileSync(`assets/tools/${name}.png`, normalize(artwork(name), 128));
    console.log('Generated logo PNG, 7-resolution ICO, and 7 tool icons from approved artwork.');
    app.exit(0);
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
