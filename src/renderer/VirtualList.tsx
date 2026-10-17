import {
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import { t } from '../shared/i18n';

export interface VirtualListHandle {
  scrollToIndex(index: number): void;
  invalidate(id: string | null): void;
}
const ESTIMATE = 112,
  OVERSCAN = 6;
function atOffset(offsets: number[], value: number) {
  let low = 0,
    high = offsets.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (offsets[middle] <= value) low = middle;
    else high = middle - 1;
  }
  return Math.min(low, Math.max(0, offsets.length - 2));
}
function Row({
  id,
  top,
  measure,
  children,
}: {
  id: string;
  top: number;
  measure: (id: string, height: number) => void;
  children: ReactNode;
}) {
  const element = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = element.current!;
    const update = () => measure(id, node.getBoundingClientRect().height);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [id, measure]);
  return (
    <div
      ref={element}
      data-virtual-row={id}
      style={{ position: 'absolute', top, left: 0, right: 0 }}
    >
      {children}
    </div>
  );
}

/** Only mounted rows are measured; offscreen rows use their last measured height. */
export function VirtualList({
  ids,
  render,
  onRange,
  empty,
  ref,
}: {
  ids: string[];
  render: (id: string, index: number) => ReactNode;
  onRange: (start: number, end: number) => void;
  empty: ReactNode;
  ref?: Ref<VirtualListHandle>;
}) {
  const element = useRef<HTMLDivElement>(null),
    heights = useRef(new Map<string, number>());
  const [version, setVersion] = useState(0),
    [viewport, setViewport] = useState({ top: 0, height: 600 });
  const offsets = useMemo(() => {
    const result = [0];
    for (const id of ids)
      result.push(result[result.length - 1] + (heights.current.get(id) ?? ESTIMATE));
    return result;
  }, [ids, version]);
  const committed = useRef({ ids, offsets });
  const measure = useCallback((id: string, height: number) => {
    if (height <= 0 || Math.abs((heights.current.get(id) ?? ESTIMATE) - height) < 0.5) return;
    heights.current.set(id, height);
    setVersion((value) => value + 1);
  }, []);
  const updateViewport = useCallback(() => {
    const node = element.current;
    if (node) setViewport({ top: node.scrollTop, height: node.clientHeight });
  }, []);
  useLayoutEffect(() => {
    const node = element.current!;
    let width = node.clientWidth;
    const observer = new ResizeObserver(() => {
      if (node.clientWidth !== width) {
        width = node.clientWidth;
        heights.current.clear();
        setVersion((value) => value + 1);
      }
      updateViewport();
    });
    observer.observe(node);
    updateViewport();
    return () => observer.disconnect();
  }, [updateViewport]);
  useLayoutEffect(() => {
    const previous = committed.current,
      node = element.current;
    if (node && previous.offsets !== offsets && previous.ids.length) {
      const top = node.scrollTop,
        oldIndex = atOffset(previous.offsets, top),
        newIndex = ids.indexOf(previous.ids[oldIndex]);
      node.scrollTop =
        newIndex < 0 ? 0 : offsets[newIndex] + Math.max(0, top - previous.offsets[oldIndex]);
      updateViewport();
    }
    committed.current = { ids, offsets };
  }, [ids, offsets, updateViewport]);
  useLayoutEffect(() => {
    const valid = new Set(ids);
    for (const id of heights.current.keys()) if (!valid.has(id)) heights.current.delete(id);
  }, [ids]);
  useImperativeHandle(
    ref,
    () => ({
      invalidate(id) {
        if (id && heights.current.delete(id)) setVersion((value) => value + 1);
      },
      scrollToIndex(index) {
        const node = element.current;
        if (!node || index < 0 || index >= ids.length) return;
        const top = offsets[index],
          bottom = offsets[index + 1];
        if (top < node.scrollTop) node.scrollTop = top;
        else if (bottom > node.scrollTop + node.clientHeight)
          node.scrollTop = bottom - node.clientHeight;
        updateViewport();
      },
    }),
    [ids, offsets, updateViewport],
  );
  const start = Math.max(0, atOffset(offsets, viewport.top) - OVERSCAN);
  const end = Math.min(
    ids.length,
    atOffset(offsets, viewport.top + viewport.height) + OVERSCAN + 1,
  );
  useLayoutEffect(() => onRange(start, end), [start, end, onRange]);
  return (
    <div
      ref={element}
      className="clipboard-list"
      tabIndex={0}
      aria-label={t('剪贴板历史')}
      onScroll={updateViewport}
    >
      {!ids.length ? (
        empty
      ) : (
        <div
          style={{
            height: offsets[offsets.length - 1],
            position: 'relative',
            overflowAnchor: 'none',
          }}
        >
          {ids.slice(start, end).map((id, offset) => (
            <Row key={id} id={id} top={offsets[start + offset]} measure={measure}>
              {render(id, start + offset)}
            </Row>
          ))}
        </div>
      )}
    </div>
  );
}
