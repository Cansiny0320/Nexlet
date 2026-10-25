import { t } from '../shared/i18n';
import sharp from 'sharp';
import { annotationBounds, annotationSvg, validateAnnotations } from '../shared/capture-editor';
export const CAPTURE_PIXELS = 36_000_000;
export const CAPTURE_BYTES = 20 * 1024 * 1024;
export async function imageSize(bytes: Buffer) {
  if (bytes.length > CAPTURE_BYTES) throw new Error(t('截图超过 20 MiB'));
  const metadata = await sharp(bytes, { limitInputPixels: CAPTURE_PIXELS }).metadata();
  const width = metadata.width ?? 0,
    height = metadata.height ?? 0;
  if (
    !width ||
    !height ||
    width * height > CAPTURE_PIXELS ||
    width > 32768 ||
    height > 32768 ||
    (metadata.pages ?? 1) > 1
  )
    throw new Error(t('截图尺寸超过限制'));
  return { width, height };
}
export async function renderAnnotations(bytes: Buffer, value: unknown): Promise<Buffer> {
  const { width, height } = await imageSize(bytes);
  const annotations = validateAnnotations(value, width, height);
  let result = bytes;
  // Apply in drawing order. Redacted pixels are replaced before the final PNG is encoded.
  for (const annotation of annotations) {
    if (annotation.kind === 'blur' || annotation.kind === 'mosaic') {
      const b = annotationBounds(annotation),
        left = Math.max(0, Math.floor(b.x)),
        top = Math.max(0, Math.floor(b.y));
      const w = Math.min(width, Math.ceil(b.x + b.width)) - left,
        h = Math.min(height, Math.ceil(b.y + b.height)) - top;
      if (w <= 0 || h <= 0) continue;
      let region = sharp(result).extract({ left, top, width: w, height: h });
      let overlay: Buffer;
      if (annotation.kind === 'blur')
        overlay = await region
          .blur(Math.max(2, annotation.stroke * 2))
          .png()
          .toBuffer();
      else {
        const block = Math.max(6, Math.round(annotation.stroke * 4));
        const tiny = await region
          .resize(Math.max(1, Math.ceil(w / block)), Math.max(1, Math.ceil(h / block)), {
            fit: 'fill',
          })
          .png()
          .toBuffer();
        overlay = await sharp(tiny)
          .resize(w, h, { fit: 'fill', kernel: 'nearest' })
          .png()
          .toBuffer();
      }
      result = await sharp(result)
        .composite([{ input: overlay, left, top }])
        .png()
        .toBuffer();
    } else {
      const svg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${annotationSvg(annotation)}</svg>`,
      );
      result = await sharp(result)
        .composite([{ input: svg }])
        .png()
        .toBuffer();
    }
  }
  if (result.length > CAPTURE_BYTES) throw new Error(t('编辑后的截图超过 20 MiB'));
  return result;
}

/** Conservative overlap detection: ambiguous/repeating/blank regions require manual adjustment. */
export async function findVerticalOverlap(
  first: Buffer,
  second: Buffer,
): Promise<{ overlap: number | null; duplicate: boolean }> {
  const [aSize, bSize] = await Promise.all([imageSize(first), imageSize(second)]);
  if (aSize.width !== bSize.width) return { overlap: null, duplicate: false };
  const width = Math.min(64, aSize.width);
  const [a, b] = await Promise.all(
    [first, second].map((bytes) =>
      sharp(bytes)
        .resize({ width, height: bytes === first ? aSize.height : bSize.height, fit: 'fill' })
        .removeAlpha()
        .toColourspace('srgb')
        .raw()
        .toBuffer(),
    ),
  );
  if (aSize.height === bSize.height && a.equals(b))
    return { overlap: aSize.height, duplicate: true };
  const max = Math.min(aSize.height, bSize.height) - 1,
    candidates: { overlap: number; error: number; variance: number }[] = [];
  for (let overlap = 16; overlap <= max; overlap++) {
    let error = 0,
      sum = 0,
      sumSquared = 0,
      n = 0;
    const rows = Math.min(32, overlap);
    for (let row = 0; row < rows; row++) {
      const y = Math.round((row * (overlap - 1)) / (rows - 1));
      for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 16)))
        for (let c = 0; c < 3; c++) {
          const v = a[((aSize.height - overlap + y) * width + x) * 3 + c],
            other = b[(y * width + x) * 3 + c];
          error += Math.abs(v - other);
          sum += v;
          sumSquared += v * v;
          n++;
        }
    }
    candidates.push({ overlap, error: error / n, variance: sumSquared / n - (sum / n) ** 2 });
  }
  candidates.sort((a, b) => a.error - b.error);
  const best = candidates[0],
    next = candidates.find((c) => best && Math.abs(c.overlap - best.overlap) > 2);
  if (!best || best.error > 6 || best.variance < 80 || (next && next.error - best.error < 2))
    return { overlap: null, duplicate: false };
  return { overlap: best.overlap, duplicate: false };
}
export async function stitchImages(
  segments: { bytes: Buffer; overlap: number }[],
): Promise<Buffer> {
  if (!segments.length || segments.length > 30) throw new Error(t('长截图需要 1–30 个片段'));
  if (segments.reduce((sum, s) => sum + s.bytes.length, 0) > 128 * 1024 * 1024)
    throw new Error(t('长截图片段超过 128 MiB'));
  const sizes = await Promise.all(segments.map((s) => imageSize(s.bytes))),
    width = sizes[0].width;
  let height = 0;
  for (let i = 0; i < segments.length; i++) {
    const overlap = segments[i].overlap;
    if (
      sizes[i].width !== width ||
      !Number.isInteger(overlap) ||
      overlap < 0 ||
      overlap >= sizes[i].height ||
      (i === 0 && overlap !== 0)
    )
      throw new Error(t('片段宽度或重叠高度无效'));
    height += sizes[i].height - overlap;
  }
  if (height > 32768 || width * height > CAPTURE_PIXELS)
    throw new Error(t('长截图超过 3600 万像素或 32768 像素高度'));
  let top = 0;
  const layers = [];
  for (let i = 0; i < segments.length; i++) {
    const h = sizes[i].height - segments[i].overlap;
    const input = await sharp(segments[i].bytes)
      .extract({ left: 0, top: segments[i].overlap, width, height: h })
      .png()
      .toBuffer();
    layers.push({ input, left: 0, top });
    top += h;
  }
  const result = await sharp({ create: { width, height, channels: 4, background: '#ffffff' } })
    .composite(layers)
    .png()
    .toBuffer();
  if (result.length > CAPTURE_BYTES) throw new Error(t('长截图超过 20 MiB'));
  return result;
}
