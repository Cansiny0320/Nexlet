import { t } from './i18n';
import type { WindowRect } from './window-layout';
export interface CaptureFrame {
  id: string;
  bounds: WindowRect;
  pixels: { width: number; height: number };
  data?: string;
}
export interface CaptureState {
  bounds: WindowRect;
  frames: CaptureFrame[];
  mode: 'region' | 'screen';
}
export type CaptureDestination = 'launcher' | 'copy' | 'save' | 'pin';
export function desktopBounds(frames: CaptureFrame[]): WindowRect {
  if (!frames.length) throw Error(t('没有可用的屏幕图像'));
  const x = Math.min(...frames.map((f) => f.bounds.x)),
    y = Math.min(...frames.map((f) => f.bounds.y));
  return {
    x,
    y,
    width: Math.max(...frames.map((f) => f.bounds.x + f.bounds.width)) - x,
    height: Math.max(...frames.map((f) => f.bounds.y + f.bounds.height)) - y,
  };
}
export function capturePlan(rect: WindowRect, frames: CaptureFrame[]) {
  if (
    !rect ||
    ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ||
    rect.width < 1 ||
    rect.height < 1
  )
    throw Error(t('请选择有效截图区域'));
  const overlaps = frames
    .map((frame) => {
      const b = frame.bounds,
        x = Math.max(rect.x, b.x),
        y = Math.max(rect.y, b.y),
        right = Math.min(rect.x + rect.width, b.x + b.width),
        bottom = Math.min(rect.y + rect.height, b.y + b.height);
      return { frame, x, y, right, bottom };
    })
    .filter((p) => p.right > p.x && p.bottom > p.y);
  if (!overlaps.length) throw Error(t('截图区域没有屏幕内容'));
  const scale = Math.max(
    ...overlaps.flatMap(({ frame: f }) => [
      f.pixels.width / f.bounds.width,
      f.pixels.height / f.bounds.height,
    ]),
  );
  const size = { width: Math.round(rect.width * scale), height: Math.round(rect.height * scale) };
  if (size.width * size.height > 36_000_000 || size.width > 32768 || size.height > 32768)
    throw Error(t('截图超过 3600 万像素，请缩小区域'));
  const parts = overlaps.map(({ frame: f, x, y, right, bottom }) => {
    const sx = f.pixels.width / f.bounds.width,
      sy = f.pixels.height / f.bounds.height,
      l = Math.round((x - f.bounds.x) * sx),
      t = Math.round((y - f.bounds.y) * sy),
      dx = Math.round((x - rect.x) * scale),
      dy = Math.round((y - rect.y) * scale);
    return {
      id: f.id,
      source: {
        x: l,
        y: t,
        width: Math.round((right - f.bounds.x) * sx) - l,
        height: Math.round((bottom - f.bounds.y) * sy) - t,
      },
      destination: {
        x: dx,
        y: dy,
        width: Math.round((right - rect.x) * scale) - dx,
        height: Math.round((bottom - rect.y) * scale) - dy,
      },
    };
  });
  return { size, parts };
}
