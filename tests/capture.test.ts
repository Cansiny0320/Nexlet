import { it, expect } from 'vite-plus/test';
import { capturePlan, desktopBounds } from '../src/shared/capture';
const frames = [
  {
    id: 'left',
    bounds: { x: -1000, y: 100, width: 1000, height: 800 },
    pixels: { width: 2000, height: 1600 },
  },
  {
    id: 'right',
    bounds: { x: 0, y: 0, width: 1200, height: 900 },
    pixels: { width: 1200, height: 900 },
  },
];
it('composites cross-display regions using real source pixels and common scale', () => {
  const p = capturePlan({ x: -100, y: 200, width: 300, height: 200 }, frames);
  expect(p.size).toEqual({ width: 600, height: 400 });
  expect(p.parts[0]).toMatchObject({
    source: { x: 1800, y: 200, width: 200, height: 400 },
    destination: { x: 0, y: 0, width: 200, height: 400 },
  });
  expect(p.parts[1]).toMatchObject({
    source: { x: 0, y: 200, width: 200, height: 200 },
    destination: { x: 200, y: 0, width: 400, height: 400 },
  });
});
it('rejects empty, offscreen and excessive images', () => {
  for (const r of [
    { x: 0, y: 0, width: 0, height: 10 },
    { x: 3000, y: 0, width: 20, height: 20 },
    { x: NaN, y: 0, width: 20, height: 20 },
  ])
    expect(() => capturePlan(r, frames)).toThrow();
  expect(() =>
    capturePlan({ x: 0, y: 0, width: 9000, height: 9000 }, [
      {
        id: 'huge',
        bounds: { x: 0, y: 0, width: 9000, height: 9000 },
        pixels: { width: 18000, height: 18000 },
      },
    ]),
  ).toThrow('3600');
});
it('keeps negative desktop origins and clips selections to source bounds', () => {
  expect(desktopBounds(frames)).toEqual({ x: -1000, y: 0, width: 2200, height: 900 });
  expect(
    capturePlan({ x: -1100, y: 100, width: 200, height: 100 }, frames).parts[0].source,
  ).toEqual({ x: 0, y: 0, width: 200, height: 200 });
});
it('rejects incomplete or non-numeric renderer coordinates', () => {
  for (const rect of [
    { x: 0, y: 0, width: 10 },
    { x: 0, y: 0, width: '10', height: 20 },
  ])
    expect(() => capturePlan(rect as any, frames)).toThrow('有效截图区域');
});
