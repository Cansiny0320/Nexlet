import { t, setLocale } from '../../shared/i18n';
import sharp, { type FormatEnum } from 'sharp';

process.parentPort.on('message', ({ data: request }) => {
  setLocale(request.locale);
  void processImage(request).then(
    (value) => process.parentPort.postMessage({ value }),
    (error) => process.parentPort.postMessage({ error: String(error?.message || error) }),
  );
});
async function processImage(request: {
  data: Uint8Array;
  operations?: { op: string; args?: unknown[] }[];
  format?: string;
  metadata?: boolean;
}) {
  if (!(request.data instanceof Uint8Array) || request.data.byteLength > 32 * 1024 * 1024)
    throw new Error(t('图像输入超过 32 MB'));
  const image = sharp(Buffer.from(request.data), { limitInputPixels: 100_000_000 });
  if (request.metadata) return image.metadata();
  const allowed = new Set([
    'resize',
    'rotate',
    'extract',
    'extend',
    'flip',
    'flop',
    'flatten',
    'blur',
    'sharpen',
    'threshold',
    'negate',
    'grayscale',
    'normalise',
    'tint',
    'gamma',
    'modulate',
    'linear',
    'recomb',
    'removeAlpha',
    'ensureAlpha',
    'trim',
  ]);
  if (request.operations && (!Array.isArray(request.operations) || request.operations.length > 30))
    throw new Error(t('图像操作超过限制'));
  for (const operation of request.operations ?? []) {
    if (
      !allowed.has(operation.op) ||
      (operation.args !== undefined && !Array.isArray(operation.args))
    )
      throw new Error(t('不支持的图像操作'));
    const method = image[operation.op as keyof typeof image] as (...args: unknown[]) => unknown;
    method.apply(image, operation.args ?? []);
  }
  const format = request.format ?? 'png';
  if (!['png', 'jpeg', 'webp', 'avif', 'tiff', 'gif'].includes(format))
    throw new Error(t('图像格式无效'));
  const result = await image
    .toFormat(format as keyof FormatEnum)
    .toBuffer({ resolveWithObject: true });
  if (result.data.length > 32 * 1024 * 1024) throw new Error(t('图像输出超过 32 MB'));
  return { data: new Uint8Array(result.data), info: result.info };
}
