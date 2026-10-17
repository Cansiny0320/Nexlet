import type { PanelPatchInput } from '../shared/host-rpc';
import { t } from '../shared/i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Folder,
  Plus,
  Settings2,
  Trash2,
  X,
  Grip,
  FileText,
  Files,
  Image as ImageIcon,
} from 'lucide-react';
import type { PanelItem, PanelState, PanelFolder } from '../shared/super-panel';
import { panelCommands } from '../shared/super-panel';
import { api, errorText, ToolIcon, IconButton } from './common';

export function SuperPanel() {
  const [state, setState] = useState<(PanelState & { theme: string }) | null>(null),
    [error, setError] = useState(''),
    [tab, setTab] = useState<'matches' | 'favorites'>('favorites'),
    [page, setPage] = useState(0),
    [folderId, setFolderId] = useState(''),
    [adding, setAdding] = useState(false),
    [filter, setFilter] = useState(''),
    [editing, setEditing] = useState(false),
    [rename, setRename] = useState(''),
    [selected, setSelected] = useState('');
  const [dragging, setDragging] = useState(''),
    [drop, setDrop] = useState<{ id: string; position: 'before' | 'after' | 'inside' } | null>(
      null,
    );
  const latest = useRef(state),
    actionRunning = useRef(false),
    lastInput = useRef<string | undefined>(undefined),
    wheelAt = useRef(0),
    root = useRef<HTMLDivElement>(null);
  latest.current = state;
  const refresh = useCallback(async () => {
    try {
      const next = await api('panel', { action: 'state' });
      setState(next);
      const id = next.input?.id || '';
      if (id !== lastInput.current) {
        lastInput.current = id;
        setTab(next.input ? 'matches' : 'favorites');
        setFolderId('');
        setPage(0);
        setAdding(false);
        setEditing(false);
        setSelected('');
        setError('');
      }
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  const act = useCallback(
    async (action: 'launch' | 'launcher' | 'clear' | 'focus' | 'hide', id?: string) => {
      if (actionRunning.current) return;
      actionRunning.current = true;
      try {
        await api('panel', action === 'launch' ? { action, id: id ?? '' } : { action });
      } catch (e) {
        setError(errorText(e));
      } finally {
        actionRunning.current = false;
      }
    },
    [],
  );
  useEffect(() => {
    void refresh();
    return window.nexlet.onChange((event) => {
      if (event === 'panel-state' || event === 'state') void refresh();
      if (event.startsWith('update:prepare:')) void api('updateReady', { token: event.slice(15) });
      if (event.startsWith('panel-move:')) {
        const point = JSON.parse(event.slice(11));
        const target = document
          .elementFromPoint(point.x, point.y)
          ?.closest<HTMLElement>('[data-selectable]');
        setSelected(target?.dataset.selectable || '');
      }
      if (event.startsWith('panel-release:')) {
        const point = JSON.parse(event.slice(14));
        const target = document
          .elementFromPoint(point.x, point.y)
          ?.closest<HTMLButtonElement>('[data-panel-command]');
        if (target && !target.disabled) void act('launch', target.dataset.panelCommand);
        else void api('panel', { action: 'focus' });
      }
    });
  }, [refresh, act]);
  useEffect(() => {
    if (!state) return;
    const media = matchMedia('(prefers-color-scheme: dark)'),
      apply = () => {
        document.documentElement.dataset.theme =
          state.theme === 'system' ? (media.matches ? 'dark' : 'light') : state.theme;
      };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [state?.theme]);
  const patch = async (value: PanelPatchInput) => {
    const current = latest.current;
    if (!current) return;
    try {
      await api('panel', {
        action: 'config',
        patch: { ...value, revision: current.config.revision },
      });
      await refresh();
      setError('');
    } catch (e) {
      setError(errorText(e));
      await refresh();
    }
  };
  const folder = state?.config.items.find(
    (i): i is PanelFolder => i.id === folderId && i.kind === 'folder',
  );
  const items = folder?.children || state?.config.items || [],
    pageCount = Math.max(1, Math.ceil(items.length / 12)),
    currentPage = Math.min(page, pageCount - 1),
    visible = items.slice(currentPage * 12, (currentPage + 1) * 12);
  const commands = new Map(state?.commands.map((c) => [c.id, c]) || []),
    known = new Set(panelCommands(state?.config.items || []).map((i) => i.commandId));
  const changePage = (delta: number) => {
    setPage((p) => Math.max(0, Math.min(pageCount - 1, p + delta)));
    setSelected('');
  };
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat || event.keyCode === 229) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (adding) {
          setAdding(false);
          setFilter('');
        } else if (rename) setRename('');
        else if (folderId) {
          setFolderId('');
          setPage(0);
        } else void act('hide');
        return;
      }
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
        return;
      const buttons = Array.from(
        root.current?.querySelectorAll<HTMLButtonElement>('[data-selectable]:not(:disabled)') || [],
      );
      if (!buttons.length) return;
      const index = buttons.findIndex((b) => b.dataset.selectable === selected);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
        const step = tab === 'favorites' ? 4 : 1,
          offset =
            event.key === 'ArrowUp'
              ? -step
              : event.key === 'ArrowDown'
                ? step
                : event.key === 'ArrowLeft'
                  ? -1
                  : 1;
        const target =
          buttons[Math.max(0, Math.min(buttons.length - 1, (index < 0 ? 0 : index) + offset))];
        setSelected(target.dataset.selectable || '');
        target.focus();
      } else if (event.key === 'Enter' && index >= 0) {
        event.preventDefault();
        buttons[index].click();
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [adding, rename, folderId, selected, tab, act]);
  if (!state)
    return (
      <div className="super-panel loading-screen">
        <p>{error || t('正在打开超级面板…')}</p>
      </div>
    );
  const renderItem = (item: PanelItem) => {
    const command = item.kind === 'command' ? commands.get(item.commandId) : null;
    return (
      <div
        key={item.id}
        className={`panel-item-wrap ${drop?.id === item.id ? 'drop-' + drop.position : ''}`}
        onDragOver={(event) => {
          if (!dragging || dragging === item.id) return;
          event.preventDefault();
          const box = event.currentTarget.getBoundingClientRect(),
            x = (event.clientX - box.left) / box.width;
          setDrop({ id: item.id, position: x < 0.25 ? 'before' : x > 0.75 ? 'after' : 'inside' });
        }}
        onDrop={(event) => {
          event.preventDefault();
          const id = event.dataTransfer.getData('text/x-nexlet-panel');
          if (id && drop?.id === item.id)
            void patch({ action: 'move', id, target: item.id, position: drop.position });
          setDragging('');
          setDrop(null);
        }}
      >
        <button
          className={`panel-tile ${selected === item.id ? 'selected' : ''}`}
          data-selectable={item.id}
          data-panel-command={item.kind === 'command' && !editing ? item.commandId : undefined}
          data-panel-item={item.id}
          disabled={item.kind === 'command' && !command && !editing}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData('text/x-nexlet-panel', item.id);
            event.dataTransfer.effectAllowed = 'move';
            setDragging(item.id);
          }}
          onDragEnd={() => {
            setDragging('');
            setDrop(null);
          }}
          onMouseEnter={() => setSelected(item.id)}
          onContextMenu={(event) => {
            event.preventDefault();
            setEditing(true);
          }}
          onClick={() => {
            if (item.kind === 'folder') {
              setFolderId(item.id);
              setPage(0);
              setSelected('');
            } else if (!editing && command) void act('launch', command.id);
          }}
          title={
            item.kind === 'folder'
              ? item.name
              : command
                ? [command.name, command.subtitle].filter(Boolean).join('\n')
                : t('功能暂不可用，配置已保留')
          }
          aria-label={
            item.kind === 'folder' ? t('打开文件夹 ') + item.name : command?.name || item.commandId
          }
        >
          {item.kind === 'folder' ? (
            <span className="panel-folder-icon">
              {item.children
                .slice(0, 4)
                .map((child) =>
                  commands.has(child.commandId) ? (
                    <ToolIcon key={child.id} command={commands.get(child.commandId)!} size={16} />
                  ) : (
                    <FileText key={child.id} size={16} />
                  ),
                )}
            </span>
          ) : command ? (
            <ToolIcon command={command} size={34} />
          ) : (
            <FileText size={30} />
          )}
          <span>{item.kind === 'folder' ? item.name : command?.name || t('暂不可用')}</span>
        </button>
        {editing && (
          <div className="panel-item-tools">
            {folder && (
              <button
                aria-label={t('移出文件夹 ') + (command?.name || t('功能'))}
                title={t('移出文件夹')}
                onClick={() => void patch({ action: 'moveOut', id: item.id })}
              >
                <ArrowUpRight size={13} />
              </button>
            )}
            <button
              aria-label={
                t('从面板移除 ') + (item.kind === 'folder' ? item.name : command?.name || t('功能'))
              }
              title={t('从面板移除')}
              onClick={() => void patch({ action: 'remove', id: item.id })}
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>
    );
  };
  return (
    <div
      ref={root}
      className="super-panel"
      onMouseDown={() => void api('panel', { action: 'focus' })}
    >
      <header className="panel-header">
        <span className="panel-brand">N</span>
        <strong>{t('超级面板')}</strong>
        <span className="flex-spacer" />
        <IconButton title={t('转到主搜索')} onClick={() => void act('launcher')}>
          <ArrowUpRight size={16} />
        </IconButton>
        <IconButton title={t('关闭超级面板')} onClick={() => void act('hide')}>
          <X size={16} />
        </IconButton>
      </header>
      {state.input && (
        <div className="panel-input-preview">
          {state.input.type === 'image' ? (
            state.preview ? (
              <img src={state.preview} alt={t('选区图片')} />
            ) : (
              <ImageIcon size={22} />
            )
          ) : state.input.type === 'files' ? (
            <Files size={22} />
          ) : (
            <FileText size={22} />
          )}
          <div>
            <small>
              {state.input.type === 'text'
                ? t('当前选区')
                : state.input.type === 'files'
                  ? t('{{v0}} 个文件 / 目录', {
                      v0: state.input.files.length,
                      count: state.input.files.length,
                    })
                  : t('当前图片')}
            </small>
            <p title={state.input.type === 'text' ? state.input.text : undefined}>
              {state.input.type === 'text'
                ? state.input.text
                : state.input.type === 'files'
                  ? state.input.files.map((f) => f.name).join('、')
                  : t('选择功能处理此图片')}
            </p>
          </div>
          <IconButton title={t('清除面板选区')} onClick={() => void act('clear')}>
            <X size={14} />
          </IconButton>
        </div>
      )}
      <nav className="panel-tabs">
        <button
          aria-pressed={tab === 'matches'}
          disabled={!state.input}
          onClick={() => {
            setTab('matches');
            setAdding(false);
          }}
        >
          {t('匹配功能')}
          {state.input && <span>{state.matches.length}</span>}
        </button>
        <button aria-pressed={tab === 'favorites'} onClick={() => setTab('favorites')}>
          {t('常用入口')}
        </button>
        <span className="flex-spacer" />
        {tab === 'favorites' && (
          <>
            <IconButton
              title={editing ? t('完成管理') : t('管理面板入口')}
              active={editing}
              onClick={() => setEditing(!editing)}
            >
              <Settings2 size={15} />
            </IconButton>
            <IconButton
              title={t('添加面板入口')}
              active={adding}
              onClick={() => {
                setAdding(!adding);
                setFilter('');
              }}
            >
              <Plus size={17} />
            </IconButton>
          </>
        )}
      </nav>
      {error || state.issue ? (
        <div className="panel-notice" role="status">
          {error || state.issue}
        </div>
      ) : null}
      {state.loading ? (
        <div className="panel-empty">{t('正在读取选区…')}</div>
      ) : adding ? (
        <div className="panel-add">
          <input
            autoFocus
            aria-label={t('搜索面板入口')}
            placeholder={t('搜索功能、应用、文件或网页')}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <div>
            {state.commands
              .filter((c) =>
                [c.name, ...c.keywords].join(' ').toLowerCase().includes(filter.toLowerCase()),
              )
              .slice(0, 100)
              .map((c) => (
                <button
                  className="panel-add-row"
                  title={[c.name, c.subtitle].filter(Boolean).join('\n')}
                  key={c.id}
                  disabled={known.has(c.id)}
                  onClick={() => void patch({ action: 'add', commandId: c.id })}
                >
                  <ToolIcon command={c} size={24} />
                  <span>{c.name}</span>
                  <small>{known.has(c.id) ? t('已添加') : t('添加')}</small>
                </button>
              ))}
          </div>
          <button
            className="button"
            onClick={() => {
              setAdding(false);
              setFilter('');
            }}
          >
            {t('完成添加')}
          </button>
        </div>
      ) : tab === 'matches' ? (
        <div className="panel-matches">
          {state.matches.length ? (
            state.matches.map((c) => (
              <button
                key={c.id}
                className={`panel-match ${selected === c.id ? 'selected' : ''}`}
                data-panel-command={c.id}
                data-selectable={c.id}
                onMouseEnter={() => setSelected(c.id)}
                onClick={() => void act('launch', c.id)}
                aria-label={c.name}
                title={[c.name, c.subtitle].filter(Boolean).join('\n')}
              >
                <ToolIcon command={c} size={29} />
                <span>
                  <strong>{c.name}</strong>
                  <small>{c.subtitle}</small>
                </span>
                <ChevronRight size={14} />
              </button>
            ))
          ) : (
            <div className="panel-empty">
              {t('没有匹配的功能')}
              <br />
              <button onClick={() => setTab('favorites')}>{t('选择常用入口')}</button>
            </div>
          )}
        </div>
      ) : (
        <div
          className="panel-favorites"
          onWheel={(event) => {
            if (Math.abs(event.deltaY) < 8 || Date.now() - wheelAt.current < 220) return;
            wheelAt.current = Date.now();
            changePage(event.deltaY > 0 ? 1 : -1);
          }}
        >
          {folder && (
            <div className="panel-folder-heading">
              <IconButton
                title={t('返回面板首页')}
                onClick={() => {
                  setFolderId('');
                  setPage(0);
                }}
              >
                <ChevronLeft size={16} />
              </IconButton>
              {rename ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void patch({ action: 'rename', id: folder.id, name: rename });
                    setRename('');
                  }}
                >
                  <input
                    autoFocus
                    aria-label={t('文件夹名称')}
                    maxLength={40}
                    value={rename}
                    onChange={(e) => setRename(e.target.value)}
                  />
                  <button className="button" type="submit">
                    {t('保存')}
                  </button>
                </form>
              ) : (
                <button
                  title={t('重命名文件夹')}
                  aria-label={t('重命名文件夹')}
                  onClick={() => setRename(folder.name)}
                >
                  {folder.name}
                </button>
              )}
            </div>
          )}
          {dragging && (
            <div
              className="panel-remove-drop"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/x-nexlet-panel');
                if (id) void patch({ action: 'remove', id });
                setDragging('');
                setDrop(null);
              }}
            >
              <Trash2 size={14} />
              {t('拖到这里移除')}
            </div>
          )}
          {items.length ? (
            <div className="panel-grid">{visible.map(renderItem)}</div>
          ) : (
            <div className="panel-empty">
              <Folder size={25} />
              <p>{t('添加常用功能，随时打开')}</p>
              <button className="button" onClick={() => setAdding(true)}>
                <Plus size={15} />
                {t('添加入口')}
              </button>
            </div>
          )}
          <div className="panel-pagination">
            <IconButton
              title={t('上一页')}
              disabled={currentPage === 0}
              onClick={() => changePage(-1)}
            >
              <ChevronLeft size={14} />
            </IconButton>
            <span>
              {currentPage + 1} / {pageCount}
            </span>
            <IconButton
              title={t('下一页')}
              disabled={currentPage === pageCount - 1}
              onClick={() => changePage(1)}
            >
              <ChevronRight size={14} />
            </IconButton>
          </div>
        </div>
      )}
      <footer className="panel-footer">
        <Grip size={12} />
        <span>
          {editing
            ? t('拖拽排序 · 拖到图标中央建立文件夹')
            : t('长按滑动选择 · 松开执行 · Esc 关闭')}
        </span>
      </footer>
    </div>
  );
}
