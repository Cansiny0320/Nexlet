import { describe, it, expect } from 'vite-plus/test';
import sharp from 'sharp';
import { renderAnnotations, stitchImages, findVerticalOverlap } from '../src/main/capture-image';
import {
  changeAnnotations,
  emptyAnnotationHistory,
  undoAnnotations,
  redoAnnotations,
  moveAnnotation,
  annotationSvg,
  type CaptureAnnotation,
} from '../src/shared/capture-editor';
const redact: CaptureAnnotation = {
  id: 'a',
  kind: 'redact',
  x: 4,
  y: 4,
  width: 8,
  height: 8,
  color: '#000000',
  stroke: 2,
};
describe('capture editor bitmap and history', () => {
  it('bakes a translucent highlight while retaining visible underlying pixels', async () => {
    const input = await sharp({
      create: { width: 16, height: 16, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    const image = await renderAnnotations(input, [
      { ...redact, kind: 'highlight', color: '#ffff00' },
    ]);
    const pixels = await sharp(image).removeAlpha().raw().toBuffer();
    const center = [...pixels.subarray((8 * 16 + 8) * 3, (8 * 16 + 8) * 3 + 3)];
    expect(center[0]).toBe(255);
    expect(center[1]).toBe(255);
    expect(center[2]).toBeGreaterThan(150);
    expect(center[2]).toBeLessThan(220);
    expect([...pixels.subarray(0, 3)]).toEqual([255, 255, 255]);
  });
  it('bakes opaque redaction into exported pixels', async () => {
    const input = await sharp({
      create: { width: 16, height: 16, channels: 3, background: '#ff0000' },
    })
      .png()
      .toBuffer();
    const result = await renderAnnotations(input, [redact]);
    const pixels = await sharp(result).removeAlpha().raw().toBuffer();
    expect([...pixels.subarray((8 * 16 + 8) * 3, (8 * 16 + 8) * 3 + 3)]).toEqual([0, 0, 0]);
    expect([...pixels.subarray(0, 3)]).toEqual([255, 0, 0]);
  });
  it('escapes text and rejects oversized or unsafe annotations', async () => {
    expect(annotationSvg({ ...redact, kind: 'text', text: '<script>&' })).toContain(
      '&lt;script&gt;&amp;',
    );
    const input = await sharp({
      create: { width: 16, height: 16, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();
    await expect(
      renderAnnotations(input, [{ ...redact, color: 'url(http://evil)' }]),
    ).rejects.toThrow();
    await expect(renderAnnotations(input, Array(501).fill(redact))).rejects.toThrow();
  });
  it('moves pen points and supports bounded undo/redo with branch invalidation', () => {
    const pen = { ...redact, kind: 'pen' as const, points: [{ x: 1, y: 2 }] };
    expect(moveAnnotation(pen, 3, 4).points).toEqual([{ x: 4, y: 6 }]);
    let history = changeAnnotations(emptyAnnotationHistory(), [pen]);
    history = changeAnnotations(history, []);
    expect(undoAnnotations(history).present).toEqual([pen]);
    expect(redoAnnotations(undoAnnotations(history)).present).toEqual([]);
    expect(changeAnnotations(undoAnnotations(history), [redact]).future).toEqual([]);
  });
});
describe('manual long screenshot stitching', () => {
  const fixture = async () => {
    const bytes = Buffer.alloc(32 * 120 * 3);
    for (let y = 0; y < 120; y++)
      for (let x = 0; x < 32; x++)
        for (let c = 0; c < 3; c++) bytes[(y * 32 + x) * 3 + c] = (y * 71 + x * 13 + c * 37) % 256;
    const full = sharp(bytes, { raw: { width: 32, height: 120, channels: 3 } });
    return {
      a: await full.clone().extract({ left: 0, top: 0, width: 32, height: 80 }).png().toBuffer(),
      b: await full.clone().extract({ left: 0, top: 40, width: 32, height: 80 }).png().toBuffer(),
    };
  };
  it('matches known overlap and stitches without duplicate rows', async () => {
    const { a, b } = await fixture();
    expect(await findVerticalOverlap(a, b)).toEqual({ overlap: 40, duplicate: false });
    const image = await stitchImages([
      { bytes: a, overlap: 0 },
      { bytes: b, overlap: 40 },
    ]);
    expect(await sharp(image).metadata()).toMatchObject({ width: 32, height: 120 });
  });
  it('detects duplicate frames and leaves ambiguous frames for manual adjustment', async () => {
    const { a } = await fixture();
    expect((await findVerticalOverlap(a, a)).duplicate).toBe(true);
    const white = await sharp({
      create: { width: 32, height: 80, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();
    expect((await findVerticalOverlap(white, white)).duplicate).toBe(true);
    const black = await sharp({
      create: { width: 32, height: 80, channels: 3, background: '#000' },
    })
      .png()
      .toBuffer();
    expect((await findVerticalOverlap(white, black)).overlap).toBeNull();
    await expect(
      stitchImages([
        { bytes: a, overlap: 0 },
        { bytes: a, overlap: 81 },
      ]),
    ).rejects.toThrow();
  });
});
