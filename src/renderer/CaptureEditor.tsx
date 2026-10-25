import { t } from '../shared/i18n';
import { useEffect, useRef, useState } from 'react';
import {
  annotationBounds,
  annotationSvg,
  changeAnnotations,
  emptyAnnotationHistory,
  moveAnnotation,
  redoAnnotations,
  undoAnnotations,
  type AnnotationKind,
  type CaptureAnnotation,
  type CaptureEditorState,
} from '../shared/capture-editor';
import type { CaptureDestination } from '../shared/capture';
import { ImageRecognition } from './ImageRecognition';
import { errorText } from './common';

const tools: [AnnotationKind | 'select', string][] = [
  ['select', '选择'],
  ['rectangle', '矩形'],
  ['ellipse', '椭圆'],
  ['arrow', '箭头'],
  ['pen', '画笔'],
  ['text', '文字'],
  ['highlight', '高亮'],
  ['mosaic', '马赛克'],
  ['blur', '模糊'],
  ['redact', '实色遮挡'],
];
export function CaptureEditor({
  initial,
  reset,
}: {
  initial: CaptureEditorState;
  reset: () => void;
}) {
  const [bitmap, setBitmap] = useState(initial),
    [preview, setPreview] = useState(initial.data),
    [history, setHistory] = useState(emptyAnnotationHistory),
    [draft, setDraft] = useState<CaptureAnnotation | null>(null);
  const [tool, setTool] = useState<AnnotationKind | 'select'>('select'),
    [color, setColor] = useState('#ff3b30'),
    [stroke, setStroke] = useState(3),
    [text, setText] = useState(''),
    [selected, setSelected] = useState('');
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [recognition, setRecognition] = useState(false),
    [long, setLong] = useState(false);
  const drag = useRef<{ x: number; y: number; original?: CaptureAnnotation } | null>(null),
    svg = useRef<SVGSVGElement>(null),
    previewQueue = useRef(Promise.resolve()),
    mounted = useRef(true),
    previewTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const annotations = history.present;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let obsolete = false;
    const timer = setTimeout(() => {
      previewQueue.current = previewQueue.current
        .catch(() => {})
        .then(async () => {
          if (obsolete) return;
          try {
            const image = await window.desktopTools.call<CaptureEditorState>('preview', {
              annotations,
            });
            if (!obsolete && mounted.current) setPreview(image.data);
          } catch (e) {
            if (!obsolete && mounted.current) setError(errorText(e));
          }
        });
    }, 100);
    previewTimer.current = timer;
    return () => {
      obsolete = true;
      clearTimeout(timer);
    };
  }, [annotations, bitmap]);
  const remove = () => {
    if (selected) {
      setHistory((h) =>
        changeAnnotations(
          h,
          h.present.filter((a) => a.id !== selected),
        ),
      );
      setSelected('');
    }
  };
  const finish = async (destination?: CaptureDestination) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      clearTimeout(previewTimer.current);
      await previewQueue.current;
      await window.desktopTools.call('complete', { annotations, destination });
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select') || busy) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        setHistory((h) => (e.shiftKey ? redoAnnotations(h) : undoAnnotations(h)));
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        setHistory(redoAnnotations);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        remove();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        void finish();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [annotations, selected, busy]);
  const point = (e: React.PointerEvent) => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      svg.current!.getScreenCTM()!.inverse(),
    );
    return {
      x: Math.max(0, Math.min(bitmap.width, p.x)),
      y: Math.max(0, Math.min(bitmap.height, p.y)),
    };
  };
  const segment = async (action: 'append' | 'removeSegment' | 'overlap', payload?: unknown) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      clearTimeout(previewTimer.current);
      await previewQueue.current;
      const next = await window.desktopTools.call<CaptureEditorState>(action, payload);
      setBitmap(next);
      setPreview(next.data);
      setHistory(emptyAnnotationHistory());
      setSelected('');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const chosen = annotations.find((a) => a.id === selected),
    selection = chosen ? annotationBounds(draft ?? chosen) : null;
  return (
    <div
      className="capture-editor"
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="capture-editor-tools">
        {tools.map(([value, label]) => (
          <button
            key={value}
            aria-pressed={tool === value}
            disabled={busy}
            onClick={() => {
              setTool(value);
              setSelected('');
              if (value === 'redact') setColor('#000000');
            }}
          >
            {t(label)}
          </button>
        ))}
        <input
          aria-label={t('标注颜色')}
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />
        <input
          aria-label={t('笔画粗细')}
          type="number"
          min={1}
          max={30}
          value={stroke}
          onChange={(e) => setStroke(Math.max(1, Math.min(30, Number(e.target.value))))}
        />
        {tool === 'text' && (
          <input
            aria-label={t('标注文字')}
            placeholder={t('输入文字后点击图片')}
            maxLength={1000}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        )}
        <button disabled={busy || !history.past.length} onClick={() => setHistory(undoAnnotations)}>
          {t('撤销')}
        </button>
        <button
          disabled={busy || !history.future.length}
          onClick={() => setHistory(redoAnnotations)}
        >
          {t('重做')}
        </button>
        <button disabled={busy || !selected} onClick={remove}>
          {t('删除标注')}
        </button>
      </div>
      <div className="capture-editor-workspace">
        <div className="capture-editor-canvas">
          <svg
            ref={svg}
            viewBox={`0 0 ${bitmap.width} ${bitmap.height}`}
            style={{ width: '100%', height: '100%' }}
            aria-label={t('截图编辑画布')}
            onPointerDown={(e) => {
              if (e.button !== 0 || busy) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              const p = point(e);
              if (tool === 'select') {
                const id = (e.target as Element)
                  .closest('[data-annotation]')
                  ?.getAttribute('data-annotation');
                const original = annotations.find((a) => a.id === id);
                setSelected(id ?? '');
                if (original) {
                  drag.current = { ...p, original };
                  setDraft(original);
                }
                return;
              }
              if (tool === 'text' && !text.trim()) return;
              const annotation: CaptureAnnotation = {
                id: crypto.randomUUID(),
                kind: tool,
                x: p.x,
                y: p.y,
                width: tool === 'text' ? Math.min(bitmap.width - p.x, text.length * stroke * 4) : 0,
                height: tool === 'text' ? stroke * 8 : 0,
                color,
                stroke,
                ...(tool === 'text' ? { text } : {}),
                ...(tool === 'pen' ? { points: [p] } : {}),
              };
              if (tool === 'text') {
                setHistory((h) => changeAnnotations(h, [...h.present, annotation]));
                setSelected(annotation.id);
                return;
              }
              drag.current = p;
              setDraft(annotation);
            }}
            onPointerMove={(e) => {
              if (!drag.current || !draft) return;
              const p = point(e),
                start = drag.current;
              if (start.original)
                setDraft(moveAnnotation(start.original, p.x - start.x, p.y - start.y));
              else
                setDraft({
                  ...draft,
                  width: p.x - start.x,
                  height: p.y - start.y,
                  ...(draft.kind === 'pen'
                    ? { points: [...(draft.points ?? []), p].slice(0, 20000) }
                    : {}),
                });
            }}
            onPointerUp={() => {
              if (!drag.current || !draft) return;
              const original = drag.current.original;
              if (
                original ||
                draft.kind === 'pen' ||
                Math.abs(draft.width) > 1 ||
                Math.abs(draft.height) > 1
              ) {
                setHistory((h) =>
                  changeAnnotations(
                    h,
                    original
                      ? h.present.map((a) => (a.id === draft.id ? draft : a))
                      : [...h.present, draft],
                  ),
                );
                setSelected(draft.id);
              }
              drag.current = null;
              setDraft(null);
            }}
            onPointerCancel={() => {
              drag.current = null;
              setDraft(null);
            }}
          >
            <image href={preview} x={0} y={0} width={bitmap.width} height={bitmap.height} />
            {tool === 'select' &&
              annotations.map((a) => {
                const b = annotationBounds(a);
                return (
                  <rect
                    key={a.id}
                    data-annotation={a.id}
                    x={b.x - 4}
                    y={b.y - 4}
                    width={Math.max(8, b.width + 8)}
                    height={Math.max(8, b.height + 8)}
                    fill="transparent"
                  />
                );
              })}
            {draft && (
              <g pointerEvents="none" dangerouslySetInnerHTML={{ __html: annotationSvg(draft) }} />
            )}
            {draft && (draft.kind === 'blur' || draft.kind === 'mosaic') && (
              <rect
                {...annotationBounds(draft)}
                fill="#ffffff44"
                stroke="#fff"
                strokeDasharray="6 4"
              />
            )}
            {selection && (
              <rect
                x={selection.x - 3}
                y={selection.y - 3}
                width={selection.width + 6}
                height={selection.height + 6}
                fill="none"
                stroke="#73b8ff"
                strokeWidth={2}
                strokeDasharray="6 4"
                pointerEvents="none"
              />
            )}
          </svg>
        </div>
        {(long || recognition) && (
          <aside className="capture-editor-side">
            {long && (
              <div className="capture-segments">
                <p>{t('点击采集后，窗口隐藏 3 秒，请手动向下滚动原页面。')}</p>
                <button
                  disabled={busy || annotations.length > 0}
                  onClick={() => void segment('append')}
                >
                  {t('采集下一段')}
                </button>
                {annotations.length > 0 && (
                  <p>{t('已有标注。继续采集前请撤销标注，以免位置改变。')}</p>
                )}
                {bitmap.segments.map((s, index) => (
                  <div key={index}>
                    <span>
                      {t('片段')}
                      {index + 1} · {s.height}px
                    </span>
                    {index > 0 && (
                      <>
                        <label>
                          {t('重叠高度')}
                          <input
                            aria-label={`片段 ${index + 1} 重叠高度`}
                            type="number"
                            min={0}
                            max={s.height - 1}
                            defaultValue={s.overlap}
                            key={s.overlap}
                            disabled={busy || annotations.length > 0}
                            onBlur={(e) => {
                              if (Number(e.target.value) !== s.overlap)
                                void segment('overlap', { index, overlap: Number(e.target.value) });
                            }}
                          />
                        </label>
                        <button
                          disabled={busy || annotations.length > 0}
                          onClick={() => void segment('removeSegment', { index })}
                        >
                          {t('删除片段')}
                        </button>
                        {s.uncertain && <p role="status">{t('未找到可靠重叠，请调整。')}</p>}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
            {recognition && <ImageRecognition annotations={annotations} />}
          </aside>
        )}
      </div>
      <div className="capture-editor-actions">
        <span>
          {bitmap.width} × {bitmap.height}
        </span>
        <button disabled={busy} onClick={reset}>
          {t('重新框选')}
        </button>
        <button disabled={busy} aria-pressed={long} onClick={() => setLong(!long)}>
          {t('长截图')}
        </button>
        <button
          disabled={busy}
          aria-pressed={recognition}
          onClick={() => setRecognition(!recognition)}
        >
          {t('OCR／翻译')}
        </button>
        <button disabled={busy} onClick={() => void finish('copy')}>
          {t('复制')}
        </button>
        <button disabled={busy} onClick={() => void finish('save')}>
          {t('保存')}
        </button>
        <button disabled={busy} onClick={() => void finish('pin')}>
          {t('贴图')}
        </button>
        <button disabled={busy} onClick={() => void finish('launcher')}>
          {t('继续处理')}
        </button>
        <button onClick={() => void window.desktopTools.call('cancel')}>{t('取消')}</button>
      </div>
      {busy && (
        <div role="status" className="capture-editor-status">
          {t('处理中…')}
        </div>
      )}
      {error && (
        <div role="alert" className="capture-editor-status">
          {error}
        </div>
      )}
    </div>
  );
}
