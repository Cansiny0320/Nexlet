import { t } from '../shared/i18n';
import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, Pin, X } from 'lucide-react';
import type { CaptureState, CaptureDestination, WindowRect } from '../shared/capture';
import { errorText } from './common';
import { CaptureEditor } from './CaptureEditor';
import type { CaptureEditorState } from '../shared/capture-editor';
export function Capture() {
  const [editor, setEditor] = useState<CaptureEditorState | null>(null);
  const [state, setState] = useState<CaptureState | null>(null),
    [rect, setRect] = useState<WindowRect | null>(null),
    [dragging, setDragging] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    void window.desktopTools.call<CaptureState>('state').then(setState);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void window.desktopTools.call('cancel');
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  async function finish(destination?: CaptureDestination) {
    if (!rect || busy || editor) return;
    setBusy(true);
    try {
      await window.desktopTools.call('complete', {
        rect: { ...rect, x: rect.x + state!.bounds.x, y: rect.y + state!.bounds.y },
        destination,
      });
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Enter') void finish();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [rect, busy, state, editor]);
  async function edit() {
    if (!rect || !state || busy) return;
    setBusy(true);
    setError('');
    try {
      setEditor(
        await window.desktopTools.call<CaptureEditorState>('edit', {
          rect: { ...rect, x: rect.x + state.bounds.x, y: rect.y + state.bounds.y },
        }),
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  if (editor)
    return (
      <CaptureEditor
        initial={editor}
        reset={() => {
          setEditor(null);
          setRect(null);
        }}
      />
    );
  if (!state) return <div className="capture-loading">{t('正在准备截图…')}</div>;
  const area = state.bounds;
  return (
    <div
      className="capture-surface"
      onContextMenu={(e) => {
        e.preventDefault();
        void window.desktopTools.call('cancel');
      }}
      onPointerDown={(e) => {
        if (e.button !== 0 || busy || (e.target as HTMLElement).closest('button')) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, y: e.clientY };
        setDragging(true);
        setError('');
        setRect(null);
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const x = Math.max(0, Math.min(area.width, e.clientX)),
          y = Math.max(0, Math.min(area.height, e.clientY));
        setRect({
          x: Math.min(x, start.current.x),
          y: Math.min(y, start.current.y),
          width: Math.abs(x - start.current.x),
          height: Math.abs(y - start.current.y),
        });
      }}
      onPointerUp={() => {
        start.current = null;
        setDragging(false);
      }}
      onDoubleClick={() => void edit()}
    >
      {state.frames.map((f) => (
        <img
          key={f.id}
          src={f.data}
          alt={t('屏幕快照')}
          draggable={false}
          style={{
            position: 'absolute',
            left: f.bounds.x - area.x,
            top: f.bounds.y - area.y,
            width: f.bounds.width,
            height: f.bounds.height,
          }}
        />
      ))}
      {rect && rect.width >= 1 && rect.height >= 1 ? (
        <>
          <div
            className="capture-selection"
            style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
          />
          <span
            className="capture-size"
            style={{ left: Math.max(0, rect.x), top: Math.max(0, rect.y - 27) }}
          >
            {Math.round(rect.width)} × {Math.round(rect.height)}
          </span>
          {!dragging && (
            <div
              className="capture-toolbar"
              style={{
                left: Math.max(8, Math.min(rect.x + rect.width - 332, area.width - 348)),
                top: Math.max(8, Math.min(rect.y + rect.height + 10, area.height - 56)),
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button
                title={t('编辑截图')}
                aria-label={t('编辑截图')}
                disabled={busy}
                onClick={() => void edit()}
              >
                {t('编辑')}
              </button>
              <button
                title={t('复制截图')}
                aria-label={t('复制截图')}
                disabled={busy}
                onClick={() => void finish('copy')}
              >
                <Copy size={18} />
              </button>
              <button
                title={t('保存截图')}
                aria-label={t('保存截图')}
                disabled={busy}
                onClick={() => void finish('save')}
              >
                <Download size={18} />
              </button>
              <button
                title={t('贴图')}
                aria-label={t('贴图')}
                disabled={busy}
                onClick={() => void finish('pin')}
              >
                <Pin size={18} />
              </button>
              <i />
              <button
                title={t('取消截图')}
                aria-label={t('取消截图')}
                onClick={() => void window.desktopTools.call('cancel')}
              >
                <X size={18} />
              </button>
              <button
                className="capture-confirm"
                title={t('完成截图（Enter）')}
                aria-label={t('完成截图')}
                disabled={busy}
                onClick={() => void finish()}
              >
                <Check size={19} />
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="capture-hint">{t('拖动选择截图区域 · Esc 或右键取消')}</div>
      )}
      {error && (
        <div className="capture-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
