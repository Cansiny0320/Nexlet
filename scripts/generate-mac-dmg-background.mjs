import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

// Keep both PNGs in Git: packaging uses these assets without requiring fonts on CI.
// Regenerate on a machine with Microsoft YaHei or PingFang SC after editing the SVG.
const source = new URL('../build-resources/mac/background.svg', import.meta.url);
for (const scale of [1, 2]) {
  const target = new URL(
    `../build-resources/mac/background${scale === 2 ? '@2x' : ''}.png`,
    import.meta.url,
  );
  await sharp(fileURLToPath(source), { density: 72 * scale })
    .withMetadata({ density: 72 * scale })
    .png()
    .toFile(fileURLToPath(target));
}
