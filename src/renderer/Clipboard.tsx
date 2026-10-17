import { formatLocale, t } from '../shared/i18n';
import { useToolState, useRestoreBarrier } from './tool-session';
import { CLIP_PAGE_SIZE, type ClipIndex, type ClipSummary } from '../shared/clipboard';
import { VirtualList, type VirtualListHandle } from './VirtualList';
import { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import {
  ClipboardCopy,
  Send,
  Pin,
  ExternalLink,
  Settings,
  Brush,
  Star,
  Trash2,
  Type,
  Image as ImageIcon,
  Files,
  ClipboardList,
  Download,
  Copy,
  Pause,
  Play,
} from 'lucide-react';
import type { ClipItem } from '../shared/types';
import { api, useApp, errorText, IconButton, Empty, relativeTime } from './common';

const filters = () =>
  [
    ['all', t('全部'), ClipboardList],
    ['text', t('文本'), Type],
    ['image', t('图像'), ImageIcon],
    ['files', t('文件'), Files],
    ['favorite', t('收藏'), Star],
  ] as const;

export function ClipboardPanel({ query, board }: { query: string; board: boolean }) {
  const { state, toast, dialog, navigate, detach, canDetach } = useApp();
  const [kind, setKind] = useToolState('kind', 'all'),
    [selected, setSelected] = useToolState<string[]>('selected', []),
    [cursor, setCursor] = useToolState('cursor', 0),
    [expanded, setExpanded] = useToolState<string | null>('expanded', null);
  const [savedCursorId, setSavedCursorId] = useToolState('cursorId', '');
  const [index, setIndex] = useState<ClipIndex>({ ids: [], revision: -1 }),
    [items, setItems] = useState(new Map<string, ClipSummary>()),
    [detail, setDetail] = useState<ClipItem | null>(null);
  const [context, setContext] = useState<{ x: number; y: number; ids: string[] } | null>(null);
  const virtual = useRef<VirtualListHandle>(null),
    loadId = useRef(0),
    loadedPages = useRef(new Set<number>()),
    pendingPages = useRef(new Set<string>());
  const cursorId = useRef(savedCursorId);
  cursorId.current = index.ids[cursor] || savedCursorId;
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  const resetScroll = useRef(true),
    scrollTarget = useRef<number | null>(null);
  const restoration = useRestoreBarrier();
  const [restoreWait] = useState(() => {
    if (!restoration || !Object.keys(restoration.initial).length) return null;
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  });
  useEffect(() => {
    if (restoreWait) restoration?.restores.add(restoreWait.promise);
    return () => restoreWait?.resolve();
  }, []);
  const locale = formatLocale(),
    dateTime = useMemo(
      () =>
        new Intl.DateTimeFormat(locale, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hourCycle: 'h23',
        }),
      [locale],
    );
  const reload = useCallback(async () => {
    const id = ++loadId.current;
    try {
      const next = await api('clipIndex', { query, kind });
      if (id !== loadId.current) return;
      loadedPages.current.clear();
      pendingPages.current.clear();
      const nextCursor = next.ids.indexOf(cursorId.current),
        available = new Set(next.ids);
      setItems((old) => new Map([...old].filter(([id]) => available.has(id))));
      setSelected((old) => {
        const kept = old.filter((value) => available.has(value));
        return kept.length ? kept : next.ids.slice(0, 1);
      });
      const position =
        nextCursor >= 0
          ? nextCursor
          : Math.max(0, Math.min(cursorRef.current, next.ids.length - 1));
      if (resetScroll.current) {
        scrollTarget.current = position;
        resetScroll.current = false;
      }
      setCursor(position);
      setIndex(next);
      if (!next.ids.length) restoreWait?.resolve();
    } catch (e) {
      if (id === loadId.current) {
        toast(errorText(e), true);
        restoreWait?.resolve();
      }
    }
  }, [query, kind, toast]);
  useEffect(() => {
    void reload();
    const off = window.nexlet.onChange((event) => {
      if (event === 'clips') void reload();
    });
    return () => {
      loadId.current++;
      off();
    };
  }, [reload]);
  const firstFilter = useRef(true);
  useEffect(() => {
    if (firstFilter.current) {
      firstFilter.current = false;
      return;
    }
    resetScroll.current = true;
    cursorId.current = '';
    cursorRef.current = 0;
    setCursor(0);
    setSavedCursorId('');
    setSelected([]);
  }, [query, kind]);
  const loadRange = useCallback(
    (start: number, end: number) => {
      const generation = loadId.current;
      for (
        let offset = Math.floor(start / CLIP_PAGE_SIZE) * CLIP_PAGE_SIZE;
        offset < end;
        offset += CLIP_PAGE_SIZE
      ) {
        const key = generation + ':' + offset;
        if (loadedPages.current.has(offset) || pendingPages.current.has(key)) continue;
        pendingPages.current.add(key);
        void api('clipPage', {
          ids: index.ids.slice(offset, offset + CLIP_PAGE_SIZE),
          revision: index.revision,
        })
          .then((page) => {
            if (generation !== loadId.current) return;
            if (page.stale) {
              void reload();
              return;
            }
            loadedPages.current.add(offset);
            setItems(
              (old) => new Map([...old, ...page.items.map((item) => [item.id, item] as const)]),
            );
            if (offset <= cursorRef.current && offset + CLIP_PAGE_SIZE > cursorRef.current)
              restoreWait?.resolve();
          })
          .catch((e) => {
            if (generation === loadId.current) {
              toast(errorText(e), true);
              restoreWait?.resolve();
            }
          })
          .finally(() => pendingPages.current.delete(key));
      }
    },
    [index, reload, toast],
  );
  useLayoutEffect(() => {
    if (scrollTarget.current !== null) {
      virtual.current?.scrollToIndex(scrollTarget.current);
      scrollTarget.current = null;
    }
  }, [index]);
  useLayoutEffect(() => {
    if (index.ids[cursor]) setSavedCursorId(index.ids[cursor]);
  }, [index, cursor]);
  const expandedAvailable = !!expanded && index.ids.includes(expanded);
  useEffect(() => {
    let valid = true;
    if (!expandedAvailable) setDetail(null);
    else
      void api('clipDetail', expanded)
        .then((value) => {
          if (valid) setDetail(value || null);
        })
        .catch((e) => {
          if (valid) toast(errorText(e), true);
        });
    return () => {
      valid = false;
    };
  }, [expanded, expandedAvailable, toast]);
  useEffect(() => {
    const hide = () => setContext(null);
    window.addEventListener('click', hide);
    return () => window.removeEventListener('click', hide);
  }, []);
  const action = useCallback(
    async (
      name: 'copy' | 'paste' | 'delete' | 'station' | 'save' | 'clear' | 'favorite',
      ids = selected,
      extra: { value?: boolean; includeFavorites?: boolean } = {},
    ) => {
      try {
        const result = await api(
          'clipAction',
          name === 'favorite'
            ? { action: name, ids, value: extra.value === true }
            : name === 'clear'
              ? { action: name, includeFavorites: extra.includeFavorites }
              : { action: name, ids },
        );
        if (name === 'copy') toast(t('已复制'));
        if (name === 'paste') toast(t('已发送粘贴请求'));
        if (name === 'save' && result) toast(t('图片已保存'));
      } catch (e) {
        toast(errorText(e), true);
      }
      setContext(null);
    },
    [selected, toast],
  );
  const remove = async (ids = selected) => {
    if (
      await dialog({
        title: t('删除所选记录？'),
        message: t('只删除 Nexlet 中的历史记录，原文件不会被删除。'),
        confirm: t('删除'),
        danger: true,
      })
    )
      await action('delete', ids);
  };
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (document.querySelector('.modal-backdrop')) return;
      const input = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const next = Math.min(
          Math.max(0, cursor + (e.key === 'ArrowDown' ? 1 : -1)),
          index.ids.length - 1,
        );
        setCursor(next);
        if (index.ids[next]) {
          setSelected([index.ids[next]]);
          virtual.current?.scrollToIndex(next);
        }
      } else if (e.key === 'Enter' && selected.length) {
        e.preventDefault();
        void action(state.canPaste ? 'paste' : 'copy');
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        const field = e.target as HTMLInputElement;
        if (input && field.selectionStart !== field.selectionEnd) return;
        if (window.getSelection()?.toString()) return;
        e.preventDefault();
        void action('copy');
      } else if (e.key === ' ' && !input) {
        e.preventDefault();
        const id = index.ids[cursor];
        if (id)
          setSelected((old) =>
            old.includes(id) ? old.filter((value) => value !== id) : [...old, id],
          );
      } else if (e.key === 'Delete' && !input && selected.length) {
        e.preventDefault();
        void remove();
      } else if ((e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key === 'f')) && !input) {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('.clipboard-search')?.focus();
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [cursor, index, selected, action, state.canPaste]);
  function select(item: ClipSummary, position: number, event: React.MouseEvent) {
    if (event.shiftKey) {
      const start = Math.min(cursor, position),
        end = Math.max(cursor, position);
      setSelected(index.ids.slice(start, end + 1));
    } else if (event.ctrlKey || event.metaKey)
      setSelected((old) =>
        old.includes(item.id) ? old.filter((id) => id !== item.id) : [...old, item.id],
      );
    else setSelected([item.id]);
    setCursor(position);
  }
  function toggleExpanded(id: string) {
    virtual.current?.invalidate(expanded);
    virtual.current?.invalidate(id);
    setExpanded(expanded === id ? null : id);
  }
  return (
    <div className="clipboard-panel">
      <div className="clipboard-tabs">
        {filters().map(([id, label, Icon]) => (
          <button key={id} className={kind === id ? 'active' : ''} onClick={() => setKind(id)}>
            <Icon size={16} />
            {label}
            {id === 'favorite' && kind === 'favorite' ? `（${index.ids.length}）` : ''}
          </button>
        ))}
        <span className="tabs-spacer" />
        <button
          className="pause-button"
          title={state.settings.clipboardEnabled ? t('暂停记录') : t('恢复记录')}
          aria-label={state.settings.clipboardEnabled ? t('暂停记录') : t('恢复记录')}
          onClick={() =>
            void api('settings', { clipboardEnabled: !state.settings.clipboardEnabled }).catch(
              (e) => toast(errorText(e), true),
            )
          }
        >
          {state.settings.clipboardEnabled ? <Pause size={15} /> : <Play size={15} />}
        </button>
      </div>
      {!state.settings.clipboardEnabled && (
        <div className="recording-paused">{t('已暂停记录新内容')}</div>
      )}
      <div className="clipboard-layout">
        <VirtualList
          ref={virtual}
          ids={index.ids}
          onRange={loadRange}
          empty={
            index.revision >= 0 ? (
              <Empty icon={<ClipboardList size={34} />}>
                {query
                  ? t('没有找到匹配的记录')
                  : board
                    ? t('中转站没有可用记录')
                    : t('复制文本、图片或文件后，历史会显示在这里')}
              </Empty>
            ) : null
          }
          render={(id, index) => {
            const item = items.get(id);
            if (!item)
              return <div className="clip-placeholder" aria-busy="true" style={{ height: 112 }} />;
            return (
              <div
                data-clip-id={item.id}
                className={`clip-item ${selected.includes(item.id) ? 'selected' : ''}`}
                role="option"
                aria-selected={selected.includes(item.id)}
                tabIndex={-1}
                onClick={(e) => select(item, index, e)}
                onDoubleClick={() => void action(state.canPaste ? 'paste' : 'copy', [item.id])}
                onContextMenu={(e) => {
                  e.preventDefault();
                  const targets = selected.includes(item.id) ? selected : [item.id];
                  setSelected(targets);
                  setContext({
                    x: Math.min(e.clientX, innerWidth - 185),
                    y: Math.min(e.clientY, innerHeight - 240),
                    ids: targets,
                  });
                }}
              >
                {item.kind === 'image' ? (
                  <div className="clip-picture">
                    <img
                      src={
                        expanded === item.id
                          ? `nexlet-image://local/${item.imagePath?.split(/[\\/]/).pop()}`
                          : item.thumbnail
                      }
                      alt={t('剪贴板图片')}
                      draggable={false}
                      className={expanded === item.id ? 'expanded' : ''}
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpanded(item.id);
                      }}
                    >
                      {expanded === item.id ? t('收起') : t('展开')}
                    </button>
                  </div>
                ) : item.kind === 'files' ? (
                  <div className="clip-files">
                    <Files size={25} />
                    <div>
                      {item.files?.map((file) => (
                        <div key={file} title={file}>
                          {file.split(/[\\/]/).pop()}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className={`clip-text ${expanded === item.id ? 'expanded' : ''}`}>
                    {(expanded === item.id && detail?.id === item.id
                      ? detail.text
                      : item.text
                    ).slice(0, expanded === item.id ? 200000 : 600)}
                    {item.text.length > 150 && (
                      <button
                        className="inline-expand"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpanded(item.id);
                        }}
                      >
                        {expanded === item.id ? t('收起') : t('展开')}
                      </button>
                    )}
                  </div>
                )}
                <div className="clip-meta">
                  <span>
                    <time
                      dateTime={new Date(item.createdAt).toISOString()}
                      title={t('最近复制或使用时间')}
                    >
                      {dateTime.format(item.createdAt)}
                    </time>{' '}
                    · {relativeTime(item.createdAt)}
                  </span>
                  <span>
                    {item.favorite && <Star size={12} fill="currentColor" />}
                    {item.kind === 'text'
                      ? t('{{v0}} 字符', { v0: item.textLength, count: item.textLength })
                      : item.kind === 'image'
                        ? `${item.width} × ${item.height}`
                        : t('{{v0}} 个文件', { v0: item.files?.length, count: item.files?.length })}
                    <em>{index + 1}</em>
                  </span>
                </div>
              </div>
            );
          }}
        />
        <aside className="clipboard-actions">
          <IconButton
            className="round primary"
            title={t('复制')}
            disabled={!selected.length}
            onClick={() => void action('copy')}
          >
            <ClipboardCopy size={22} />
          </IconButton>
          <IconButton
            className="round primary"
            title={state.canPaste ? t('执行粘贴') : t('请从目标应用用快捷键唤起后粘贴')}
            disabled={!selected.length || !state.canPaste}
            onClick={() => void action('paste')}
          >
            <Send size={21} />
          </IconButton>
          <IconButton
            className="round primary"
            title={t('悬浮中转')}
            disabled={!selected.length}
            onClick={() => void action('station')}
          >
            <Pin size={21} />
          </IconButton>
          <div className="rail-spacer" />
          <IconButton
            title={t('打开独立剪贴板')}
            disabled={!canDetach}
            onClick={() => void detach()}
          >
            <ExternalLink size={20} />
          </IconButton>
          <IconButton title={t('剪贴板设置')} onClick={() => navigate('settings')}>
            <Settings size={20} />
          </IconButton>
          <IconButton
            title={t('清空历史记录')}
            onClick={async () => {
              if (
                await dialog({
                  title: t('清空剪贴板历史？'),
                  message: t('收藏内容会保留。不会清空系统剪贴板，也不会删除原文件。'),
                  confirm: t('清空历史'),
                  danger: true,
                })
              )
                await action('clear', [], { includeFavorites: false });
            }}
          >
            <Brush size={21} />
          </IconButton>
        </aside>
      </div>
      {selected.length > 1 && (
        <div className="selection-status">
          {t('已选择 {{v0}} 项 · Ctrl/Cmd+C 合并复制', { v0: selected.length })}
        </div>
      )}
      {context && (
        <div
          className="context-menu"
          style={{ left: context.x, top: context.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={() => void action('copy', context.ids)}>
            <Copy size={15} />
            {t('复制')}
          </button>
          <button disabled={!state.canPaste} onClick={() => void action('paste', context.ids)}>
            <Send size={15} />
            {t('执行粘贴')}
          </button>
          <button onClick={() => void action('station', context.ids)}>
            <Pin size={15} />
            {t('悬浮中转')}
          </button>
          <hr />
          <button
            onClick={() =>
              void action('favorite', context.ids, { value: !items.get(context.ids[0])?.favorite })
            }
          >
            <Star size={15} />
            {items.get(context.ids[0])?.favorite ? t('取消收藏') : t('收藏')}
          </button>
          {context.ids.length === 1 && items.get(context.ids[0])?.kind === 'image' && (
            <button onClick={() => void action('save', context.ids)}>
              <Download size={15} />
              {t('保存图片')}
            </button>
          )}
          <button
            onClick={() => {
              void remove(context.ids);
              setContext(null);
            }}
          >
            <Trash2 size={15} />
            {t('删除记录')}
          </button>
        </div>
      )}
    </div>
  );
}
