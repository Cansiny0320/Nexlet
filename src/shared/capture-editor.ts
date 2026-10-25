import { t } from './i18n';
export type AnnotationKind =
  | 'rectangle'
  | 'ellipse'
  | 'arrow'
  | 'pen'
  | 'text'
  | 'highlight'
  | 'mosaic'
  | 'blur'
  | 'redact';
export interface CaptureAnnotation {
  id: string;
  kind: AnnotationKind;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  stroke: number;
  text?: string;
  points?: { x: number; y: number }[];
}
export interface CaptureBitmap {
  data: string;
  width: number;
  height: number;
}
export interface CaptureEditorState extends CaptureBitmap {
  segments: { height: number; overlap: number; uncertain: boolean }[];
}
export interface AnnotationHistory {
  past: CaptureAnnotation[][];
  present: CaptureAnnotation[];
  future: CaptureAnnotation[][];
}
export const emptyAnnotationHistory = (): AnnotationHistory => ({
  past: [],
  present: [],
  future: [],
});
export function changeAnnotations(
  history: AnnotationHistory,
  annotations: CaptureAnnotation[],
): AnnotationHistory {
  return {
    past: [...history.past, history.present].slice(-50),
    present: structuredClone(annotations),
    future: [],
  };
}
export function undoAnnotations(history: AnnotationHistory): AnnotationHistory {
  return !history.past.length
    ? history
    : {
        past: history.past.slice(0, -1),
        present: history.past.at(-1)!,
        future: [history.present, ...history.future].slice(0, 50),
      };
}
export function redoAnnotations(history: AnnotationHistory): AnnotationHistory {
  return !history.future.length
    ? history
    : {
        past: [...history.past, history.present].slice(-50),
        present: history.future[0],
        future: history.future.slice(1),
      };
}
export function annotationBounds(annotation: CaptureAnnotation) {
  if (annotation.kind === 'pen' && annotation.points?.length) {
    const xs = annotation.points.map((p) => p.x),
      ys = annotation.points.map((p) => p.y);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
  }
  return {
    x: Math.min(annotation.x, annotation.x + annotation.width),
    y: Math.min(annotation.y, annotation.y + annotation.height),
    width: Math.abs(annotation.width),
    height: Math.abs(annotation.height),
  };
}
export function moveAnnotation(
  annotation: CaptureAnnotation,
  dx: number,
  dy: number,
): CaptureAnnotation {
  return {
    ...annotation,
    x: annotation.x + dx,
    y: annotation.y + dy,
    ...(annotation.points
      ? { points: annotation.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) }
      : {}),
  };
}
const xml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!,
  );
/** Only generated geometry/text is allowed; no user SVG, URLs, HTML or external resources. */
export function annotationSvg(annotation: CaptureAnnotation): string {
  const a = annotation,
    b = annotationBounds(a),
    style = `stroke="${a.color}" stroke-width="${a.stroke}" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  if (a.kind === 'rectangle')
    return `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" ${style}/>`;
  if (a.kind === 'redact')
    return `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="${a.color}"/>`;
  if (a.kind === 'highlight')
    return `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="${a.color}" fill-opacity="0.3"/>`;
  if (a.kind === 'ellipse')
    return `<ellipse cx="${b.x + b.width / 2}" cy="${b.y + b.height / 2}" rx="${b.width / 2}" ry="${b.height / 2}" ${style}/>`;
  if (a.kind === 'pen')
    return `<polyline points="${a.points?.map((p) => `${p.x},${p.y}`).join(' ') ?? ''}" ${style}/>`;
  if (a.kind === 'arrow') {
    const x = a.x + a.width,
      y = a.y + a.height,
      angle = Math.atan2(a.height, a.width),
      length = Math.max(10, a.stroke * 4);
    return `<path d="M${a.x},${a.y} L${x},${y} M${x - length * Math.cos(angle - 0.5)},${y - length * Math.sin(angle - 0.5)} L${x},${y} L${x - length * Math.cos(angle + 0.5)},${y - length * Math.sin(angle + 0.5)}" ${style}/>`;
  }
  if (a.kind === 'text')
    return `<text x="${a.x}" y="${a.y}" font-family="sans-serif" font-size="${Math.max(12, a.stroke * 6)}" fill="${a.color}">${(
      a.text ?? ''
    )
      .split('\n')
      .map((line, i) => `<tspan x="${a.x}" dy="${i ? '1.25em' : '1em'}">${xml(line)}</tspan>`)
      .join('')}</text>`;
  return '';
}
export function validateAnnotations(
  value: unknown,
  width: number,
  height: number,
): CaptureAnnotation[] {
  if (!Array.isArray(value) || value.length > 500) throw new Error(t('标注数量超过限制'));
  let points = 0;
  return value.map((a) => {
    if (
      !a ||
      typeof a !== 'object' ||
      typeof a.id !== 'string' ||
      a.id.length > 100 ||
      ![
        'rectangle',
        'ellipse',
        'arrow',
        'pen',
        'text',
        'highlight',
        'mosaic',
        'blur',
        'redact',
      ].includes(a.kind) ||
      !/^#[0-9a-f]{6}$/i.test(a.color) ||
      !Number.isFinite(a.stroke) ||
      a.stroke < 1 ||
      a.stroke > 100 ||
      ![a.x, a.y, a.width, a.height].every(Number.isFinite)
    )
      throw new Error(t('标注参数无效'));
    const b = annotationBounds(a);
    if (b.x < -width || b.y < -height || b.x + b.width > width * 2 || b.y + b.height > height * 2)
      throw new Error(t('标注超出画布范围'));
    if (a.text !== undefined && (typeof a.text !== 'string' || a.text.length > 10000))
      throw new Error(t('标注文本过长'));
    if (
      a.points !== undefined &&
      (!Array.isArray(a.points) ||
        (points += a.points.length) > 20000 ||
        a.points.some(
          (p: { x: number; y: number }) =>
            !p ||
            !Number.isFinite(p.x) ||
            !Number.isFinite(p.y) ||
            Math.abs(p.x) > width * 2 ||
            Math.abs(p.y) > height * 2,
        ))
    )
      throw new Error(t('画笔点位无效'));
    return {
      id: a.id,
      kind: a.kind,
      x: a.x,
      y: a.y,
      width: a.width,
      height: a.height,
      color: a.color,
      stroke: a.stroke,
      ...(a.text === undefined ? {} : { text: a.text }),
      ...(a.points === undefined
        ? {}
        : { points: a.points.map(({ x, y }: { x: number; y: number }) => ({ x, y })) }),
    };
  });
}
