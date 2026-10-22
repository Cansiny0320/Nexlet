import { t } from '../shared/i18n';
import { ToolSessionContext, createToolSession } from './tool-session';
import { lazy, useState, useEffect, useRef, useCallback, useTransition } from 'react';
import { Pin, Minus, Square, X, ChevronLeft, ExternalLink, GripVertical } from 'lucide-react';
import type { AppState, PluginSessionState } from '../shared/types';
import { BUILTIN_COMMANDS } from '../shared/types';
import { INPUT_TEXT_LIMIT, type LaunchInput, type InputSource } from '../shared/launch';
import { AppContext, api, errorText, IconButton, Modal, ToolIcon, type DialogSpec } from './common';
import { Launcher } from './Launcher';
import { brandIcon } from './tool-artwork';
import { LaunchInputChip } from './LaunchInputChip';
import { usePluginSearch, PluginSearchResults } from './PluginSearch';
import { saveBeforeUpdate, registerUpdateSave } from './update-save';
import { retainSearchInputs } from './state-refresh';
import { ToolBoundary } from './ToolBoundary';
import { useTitlebarDrag } from './use-titlebar-drag';

const ClipboardPanel = lazy(() =>
  import('./Clipboard').then((module) => ({ default: module.ClipboardPanel })),
);
const ScratchpadPanel = lazy(() =>
  import('./Scratchpad').then((module) => ({ default: module.ScratchpadPanel })),
);
const ToolsPanel = lazy(() => import('./Tools').then((module) => ({ default: module.ToolsPanel })));
const WebPanel = lazy(() => import('./Tools').then((module) => ({ default: module.WebPanel })));
const JsonTool = lazy(() => import('./JsonTool').then((module) => ({ default: module.JsonTool })));
const FileSearch = lazy(() =>
  import('./FileSearch').then((module) => ({ default: module.FileSearch })),
);
const PluginsPanel = lazy(() =>
  import('./Plugins').then((module) => ({ default: module.PluginsPanel })),
);
const SettingsPanel = lazy(() =>
  import('./Settings').then((module) => ({ default: module.SettingsPanel })),
);
const SnippetsPanel = lazy(() =>
  import('./Productivity').then((module) => ({ default: module.SnippetsPanel })),
);
const WorkspacesPanel = lazy(() =>
  import('./Productivity').then((module) => ({ default: module.WorkspacesPanel })),
);

const params = new URLSearchParams(location.search);
const detached = params.get('detached') === '1';
const board = params.get('board') === '1';
const transfer = params.get('transfer') || '';
export function App() {
  const pluginSearch = usePluginSearch();
  const [session, setSession] = useState(() => createToolSession()),
    [restoring, setRestoring] = useState(!!transfer),
    [transferring, setTransferring] = useState(false);
  const [readySession, setReadySession] = useState<typeof session | null>(null);
  const [openingTool, startNavigation] = useTransition();
  const [state, setState] = useState<AppState | null>(null),
    [loadError, setLoadError] = useState('');
  const [view, setView] = useState(params.get('view') || 'launcher'),
    [query, setQuery] = useState(''),
    [payload, setPayload] = useState('');
  const navigationGeneration = useRef(0);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeDraft = useRef({ view, query, payload, session });
  activeDraft.current = { view, query, payload, session };
  const saveDraft = useCallback(async () => {
    const current = activeDraft.current;
    if (!BUILTIN_COMMANDS.some((command) => command.id === 'tool:' + current.view)) return;
    await api('toolDraft', {
      action: 'save',
      view: current.view,
      state: { values: current.session.values, query: current.query, payload: current.payload },
    });
  }, []);
  useEffect(() => registerUpdateSave(saveDraft), [saveDraft]);
  useEffect(() => {
    const changed = () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(() => {
        void saveDraft().catch((error) => setNotification({ text: errorText(error), error: true }));
      }, 400);
    };
    session.changed = changed;
    changed();
    return () => {
      session.changed = undefined;
    };
  }, [session, view, query, payload, saveDraft]);
  const [launchInput, setLaunchInput] = useState<(LaunchInput & { preview?: string }) | null>(null),
    [inputSource, setInputSource] = useState<InputSource>('input');
  const captureGeneration = useRef(0),
    pluginGeneration = useRef(0),
    transferDone = useRef(false);
  const [capturing, setCapturing] = useState(false),
    [pluginInfo, setPluginInfo] = useState<PluginSessionState | null>(null);
  const syncPlugin = useCallback(async () => {
    const generation = ++pluginGeneration.current;
    const info = await api('pluginSession');
    if (generation !== pluginGeneration.current) return;
    setPluginInfo(info);
    setView((current) => (info ? 'plugin' : current === 'plugin' ? 'launcher' : current));
    if (info) {
      setLaunchInput(null);
      setQuery('');
    }
  }, []);
  const [pinned, setPinned] = useState(board),
    [notification, setNotification] = useState<{ text: string; error: boolean } | null>(null);
  const [dialogSpec, setDialogSpec] = useState<DialogSpec | null>(null);
  const [closingTokens, setClosingTokens] = useState<string[]>([]);
  const resolver = useRef<((r: string | boolean | null) => void) | null>(null),
    input = useRef<HTMLInputElement>(null),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((text: string, error = false) => {
    setNotification({ text, error });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setNotification(null), error ? 6500 : 2500);
  }, []);
  const titlebarDrag = useTitlebarDrag(view === 'launcher', toast);
  const updateGeneration = useRef(0);
  const latestUpdate = useRef<AppState['update'] | null>(null);
  const refresh = useCallback(async () => {
    const generation = updateGeneration.current;
    try {
      const next = await api('state');
      setState((current) =>
        retainSearchInputs(
          current,
          generation !== updateGeneration.current && latestUpdate.current
            ? { ...next, update: latestUpdate.current }
            : next,
        ),
      );
    } catch (e) {
      setLoadError(errorText(e));
    }
  }, []);
  const navigate = useCallback(
    (next: string, initial = '') => {
      void saveDraft().catch((error) => toast(errorText(error), true));
      const generation = ++navigationGeneration.current;
      captureGeneration.current++;
      setCapturing(false);
      if (next !== 'plugin') void api('window', { action: 'exitPlugin' });
      const open = (draft: Record<string, unknown> | null = null) =>
        startNavigation(() => {
          if (generation !== navigationGeneration.current) return;
          setLaunchInput(null);
          setSession(createToolSession((draft?.values as Record<string, unknown>) || {}));
          setView(next);
          setPayload(draft ? String(draft.payload || '') : initial);
          setQuery(draft ? String(draft.query || '') : next === 'clipboard' ? initial : '');
        });
      if (!initial && BUILTIN_COMMANDS.some((command) => command.id === 'tool:' + next))
        void api('toolDraft', { action: 'read', view: next }).then(
          (draft) => open(draft && typeof draft === 'object' ? draft : null),
          () => open(),
        );
      else open();
      void api('clearInput');
    },
    [startNavigation, saveDraft, toast],
  );
  const clearLaunchInput = useCallback(() => {
    captureGeneration.current++;
    setCapturing(false);
    setLaunchInput(null);
    setQuery('');
    setInputSource('input');
    void api('clearInput');
    input.current?.focus();
  }, []);
  const dialog = useCallback(
    (spec: DialogSpec) =>
      new Promise<string | boolean | null>((resolve) => {
        void api('window', { action: 'busy', value: true });
        resolver.current?.(null);
        resolver.current = resolve;
        setDialogSpec(spec);
      }),
    [],
  );
  const openWebQuery = useCallback(
    async (id: string) => {
      const value = await dialog({
        title: t('网页搜索'),
        message: t('输入本次搜索内容'),
        input: '',
        confirm: t('搜索'),
      });
      if (typeof value === 'string' && value.trim())
        try {
          await api('launch', { id, query: value });
        } catch (e) {
          toast(errorText(e), true);
        }
    },
    [dialog, toast],
  );
  useEffect(() => {
    void refresh();
    void syncPlugin();
    return window.nexlet?.onChange((event) => {
      if (event === 'state') void refresh();
      if (event.startsWith('updates:')) {
        updateGeneration.current++;
        const update = JSON.parse(event.slice(8)) as AppState['update'];
        latestUpdate.current = update;
        setState((current) => (current ? { ...current, update } : current));
      }
      if (event === 'drafts-cleared') {
        if (draftTimer.current) clearTimeout(draftTimer.current);
        setSession(createToolSession());
        setView('launcher');
        setQuery('');
        setPayload('');
      }
      if (event === 'plugin-changed') void syncPlugin();
      if (event.startsWith('close:prepare:')) {
        const token = event.slice(14);
        setClosingTokens((old) => [...old, token]);
        void saveBeforeUpdate().then(
          () => api('updateReady', { token }),
          (error) => api('updateReady', { token, error: errorText(error) }),
        );
      }
      if (event.startsWith('close:cancel:')) {
        const token = event.slice(13);
        setClosingTokens((old) => old.filter((value) => value !== token));
      }
      if (event.startsWith('update:prepare:'))
        void saveBeforeUpdate().then(
          () => api('updateReady', { token: event.slice(15) }),
          (error) => api('updateReady', { token: event.slice(15), error: errorText(error) }),
        );
      if (event === 'focus') {
        input.current?.focus();
        input.current?.select();
      }
      if (event.startsWith('error:')) toast(event.slice(6), true);
      if (event.startsWith('navigate:')) navigate(event.slice(9));
      if (event.startsWith('open-view:')) navigate(event.slice(10));
      if (event.startsWith('open-tool:')) {
        const value = JSON.parse(event.slice(10));
        navigate(value.view, value.payload || '');
      }
      if (event.startsWith('selection-input:')) {
        void saveDraft().catch((error) => toast(errorText(error), true));
        const generation = ++captureGeneration.current;
        setCapturing(true);
        void api('selectionInput', event.slice(16))
          .then((value) => {
            if (generation !== captureGeneration.current) return;
            setSession(createToolSession());
            setView('launcher');
            setLaunchInput(value);
            setQuery('');
            setInputSource(value.from);
            setCapturing(false);
          })
          .catch((e) => {
            setCapturing(false);
            toast(errorText(e), true);
          });
      }
      if (event.startsWith('web-query:')) void openWebQuery(event.slice(10));
    });
  }, [refresh, navigate, toast, syncPlugin, openWebQuery, saveDraft]);
  useEffect(() => {
    void api('window', { action: 'view', view }).catch((e) => toast(errorText(e), true));
    setTimeout(() => input.current?.focus(), 50);
  }, [view, toast]);
  useEffect(() => {
    void api('window', {
      action: 'overlay',
      visible:
        !!dialogSpec ||
        (view === 'plugin' &&
          (!!notification || !!(pluginSearch.state?.visible && pluginSearch.state.results.length))),
    });
  }, [dialogSpec, notification, view, pluginSearch.state]);
  useEffect(() => {
    void api('window', {
      action: 'busy',
      value: !!dialogSpec || transferring || restoring || openingTool,
    });
  }, [dialogSpec, transferring, restoring, openingTool]);
  useEffect(() => {
    if (!state || restoring) return;
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () =>
      (document.documentElement.dataset.theme =
        state.settings.theme === 'system'
          ? media.matches
            ? 'dark'
            : 'light'
          : state.settings.theme);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [state?.settings.theme, restoring]);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (
        event.isComposing ||
        event.keyCode === 229 ||
        event.repeat ||
        dialogSpec ||
        transferring ||
        document.querySelector('.modal-backdrop,dialog[open]')
      )
        return;
      if (
        event.key === 'Backspace' &&
        !event.defaultPrevented &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey &&
        !detached &&
        view !== 'launcher' &&
        event.target instanceof HTMLInputElement &&
        event.target.closest('.titlebar') &&
        event.target.value === ''
      ) {
        event.preventDefault();
        navigate('launcher');
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === ',') {
        event.preventDefault();
        navigate('settings');
      }
      if (event.key === 'Escape' && !event.defaultPrevented) {
        if (query) setQuery('');
        else if (launchInput) clearLaunchInput();
        else if (view !== 'launcher' && !detached) navigate('launcher');
        else void api('window', { action: 'hide' });
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [view, query, launchInput, dialogSpec, transferring, navigate, clearLaunchInput]);
  useEffect(() => {
    if (!transfer) return;
    void api('toolSession', { action: 'read', token: transfer })
      .then((snapshot) => {
        setSession(createToolSession(snapshot.state));
        setQuery(snapshot.query);
        setView(snapshot.view);
        setRestoring(false);
      })
      .catch((e) => {
        setLoadError(errorText(e));
        void api('toolSession', { action: 'ready', token: transfer, error: errorText(e) });
      });
  }, []);
  const toolReady = useCallback(() => {
    setReadySession(session);
    const scroll = session.initial.__scroll as Record<string, number> | undefined;
    if (scroll)
      document
        .querySelectorAll<HTMLElement>(
          '.main-content .scroll-panel, .main-content textarea, .main-content .cm-scroller',
        )
        .forEach((element, index) => {
          element.scrollTop = scroll[index] || 0;
        });
    if (transfer && !transferDone.current) {
      transferDone.current = true;
      void api('toolSession', { action: 'ready', token: transfer }).catch(() => {});
    }
  }, [session]);
  const toolError = useCallback((error: Error) => {
    if (transfer && !transferDone.current) {
      transferDone.current = true;
      void api('toolSession', { action: 'ready', token: transfer, error: errorText(error) }).catch(
        () => {},
      );
    }
  }, []);
  const detachTool = async () => {
    if (transferring || detached) return;
    setTransferring(true);
    try {
      if (view === 'plugin') await api('window', { action: 'detach', view });
      else {
        await Promise.all([...session.before].map((save) => save()));
        await api('window', {
          action: 'detach',
          view,
          snapshot: { version: 1, view, query, state: session.values },
        });
        navigate('launcher');
      }
    } catch (e) {
      toast(errorText(e), true);
    } finally {
      setTransferring(false);
    }
  };
  const control = async (action: 'pin' | 'minimize' | 'maximize' | 'close') => {
    try {
      const value = await api('window', { action });
      if (action === 'pin') setPinned(value);
    } catch (e) {
      toast(errorText(e), true);
    }
  };
  const acceptFiles = async (files: File[], from: 'drop' | 'paste') => {
    if (!files.length) return;
    const generation = ++captureGeneration.current;
    setCapturing(true);
    try {
      const paths = files.map((file) => window.nexlet.pathForFile(file)).filter(Boolean);
      let captured: LaunchInput, preview: string | undefined;
      if (paths.length === files.length) {
        captured = await api('launchInput', { type: 'files', paths, from });
      } else {
        const file = files.find((f) => f.type.startsWith('image/'));
        if (!file) throw new Error(t('暂不支持此粘贴内容'));
        if (file.size > 20 * 1024 * 1024) throw new Error(t('图片超过 20 MB'));
        const bitmap = await createImageBitmap(file);
        if (bitmap.width * bitmap.height > 36_000_000) {
          bitmap.close();
          throw new Error(t('图片超过 3600 万像素'));
        }
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
        bitmap.close();
        if (generation !== captureGeneration.current) return;
        preview = canvas.toDataURL('image/png');
        captured = await api('launchInput', { type: 'image', data: preview, from });
      }
      if (generation === captureGeneration.current) {
        setLaunchInput({ ...captured, preview });
        setQuery('');
        setInputSource(from);
      }
    } catch (e) {
      if (generation === captureGeneration.current) toast(errorText(e), true);
    } finally {
      if (generation === captureGeneration.current) setCapturing(false);
    }
  };
  if (!state || restoring)
    return (
      <div className="loading-screen">
        <img
          className="brand-mark"
          src={brandIcon}
          width={48}
          height={48}
          alt=""
          draggable={false}
        />
        <p>{loadError || t('正在打开 Nexlet…')}</p>
        {loadError && (
          <button className="button" onClick={() => void refresh()}>
            {t('重试')}
          </button>
        )}
      </div>
    );
  const command =
    view === 'plugin'
      ? state.commands.find((c) => c.pluginId === pluginInfo?.id && c.feature === pluginInfo?.code)
      : BUILTIN_COMMANDS.find((c) => c.id === 'tool:' + view);
  return (
    <ToolSessionContext.Provider value={session}>
      <AppContext.Provider
        value={{
          state,
          refresh,
          toast,
          dialog,
          navigate,
          detach: detachTool,
          canDetach: !detached && readySession === session,
        }}
      >
        <div
          inert={state.update.phase === 'installing' || closingTokens.length > 0}
          className={`app-shell view-${view} ${detached ? 'detached' : ''}`}
          onDragOver={(e) => {
            if (view === 'launcher' && e.dataTransfer.types.includes('Files')) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }
          }}
          onDrop={(e) => {
            if (view === 'launcher') {
              e.preventDefault();
              void acceptFiles(Array.from(e.dataTransfer.files), 'drop');
            }
          }}
          onPaste={(e) => {
            if (view !== 'launcher') return;
            if (e.clipboardData.files.length) {
              e.preventDefault();
              void acceptFiles(Array.from(e.clipboardData.files), 'paste');
            } else if (e.target === input.current) {
              e.preventDefault();
              const next =
                query.slice(0, input.current?.selectionStart ?? 0) +
                e.clipboardData.getData('text/plain') +
                query.slice(input.current?.selectionEnd ?? query.length);
              if (next.length > INPUT_TEXT_LIMIT) {
                toast(t('输入最多 50 万字符'), true);
                return;
              }
              captureGeneration.current++;
              setCapturing(false);
              setInputSource('paste');
              setQuery(next);
            }
          }}
        >
          <header className="titlebar" {...titlebarDrag}>
            <div className="window-drag-handle" aria-label={t('拖动窗口')} title={t('拖动窗口')}>
              <GripVertical size={17} />
            </div>
            {view === 'launcher' ? (
              <>
                {launchInput && (
                  <LaunchInputChip
                    key={launchInput.id}
                    input={launchInput}
                    preview={launchInput.preview}
                    onClear={clearLaunchInput}
                  />
                )}
                <input
                  ref={input}
                  className="launcher-input"
                  aria-label={t('搜索功能、应用或快捷方式')}
                  placeholder={launchInput ? t('筛选处理功能…') : t('搜索功能 / 粘贴文件、图片')}
                  maxLength={INPUT_TEXT_LIMIT}
                  value={query}
                  onChange={(e) => {
                    captureGeneration.current++;
                    setCapturing(false);
                    setInputSource('input');
                    setQuery(e.target.value);
                  }}
                  autoComplete="off"
                  spellCheck={false}
                />
              </>
            ) : view === 'clipboard' ? (
              <>
                <ToolIcon command={command!} />
                <input
                  ref={input}
                  className="clipboard-search"
                  aria-label={t('搜索剪贴板')}
                  placeholder={t('搜索…')}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {board && <span className="subtle">{t('悬浮中转')}</span>}
              </>
            ) : (
              <div className="plugin-pill" title={t('拖动窗口')}>
                {command && <ToolIcon command={command} size={20} />}
                <span role="heading" aria-level={1}>
                  {view === 'plugin'
                    ? pluginInfo?.name || t('正在打开插件…')
                    : command
                      ? t(command.name)
                      : 'Nexlet'}
                </span>
                {!detached && (
                  <button
                    className="plugin-pill-close"
                    aria-label={t('关闭当前工具')}
                    title={t('返回首页')}
                    onClick={() => navigate('launcher')}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )}
            {view === 'plugin' && pluginSearch.state?.visible && (
              <input
                className="clipboard-search"
                aria-label={t('插件搜索')}
                placeholder={pluginSearch.state.placeholder}
                value={pluginSearch.state.text}
                onChange={(e) =>
                  void pluginSearch.change(e.target.value).catch((e) => toast(errorText(e), true))
                }
              />
            )}
            <div className="titlebar-spacer" />
            <div className="window-controls">
              {view === 'launcher' && ['available', 'downloaded'].includes(state.update.phase) && (
                <button
                  className="button quiet"
                  title={t('版本 {{v0}}，打开更新设置', { v0: state.update.version })}
                  onClick={() => navigate('settings')}
                >
                  {state.update.phase === 'downloaded' ? t('待安装更新') : t('有新版本')}
                </button>
              )}
              {!detached && view !== 'launcher' && (
                <IconButton title={t('返回首页')} onClick={() => navigate('launcher')}>
                  <ChevronLeft size={17} />
                </IconButton>
              )}
              {view !== 'launcher' &&
                view !== 'settings' &&
                view !== 'plugins' &&
                view !== 'web' &&
                !detached && (
                  <IconButton
                    title={t('分离为独立窗口')}
                    disabled={transferring || (view !== 'plugin' && readySession !== session)}
                    onClick={() => void detachTool()}
                  >
                    <ExternalLink size={16} />
                  </IconButton>
                )}
              {view !== 'launcher' && (
                <IconButton
                  title={t('固定窗口')}
                  active={pinned}
                  onClick={() => void control('pin')}
                >
                  <Pin size={16} />
                </IconButton>
              )}
              {view === 'launcher' ? (
                <button
                  className="brand-button"
                  title={t('设置')}
                  aria-label={t('打开设置')}
                  onClick={() => navigate('settings')}
                >
                  <img src={brandIcon} width={30} height={30} alt="" draggable={false} />
                  {state.shortcutError && <i />}
                </button>
              ) : (
                <>
                  <IconButton title={t('最小化')} onClick={() => void control('minimize')}>
                    <Minus size={16} />
                  </IconButton>
                  <IconButton title={t('最大化')} onClick={() => void control('maximize')}>
                    <Square size={13} />
                  </IconButton>
                  <IconButton title={t('关闭窗口')} onClick={() => void control('close')}>
                    <X size={17} />
                  </IconButton>
                </>
              )}
            </div>
          </header>
          <main
            className="main-content"
            inert={transferring}
            onScrollCapture={() => {
              const scroll: Record<string, number> = {};
              document
                .querySelectorAll<HTMLElement>(
                  '.main-content .scroll-panel, .main-content textarea, .main-content .cm-scroller',
                )
                .forEach((element, index) => {
                  scroll[index] = element.scrollTop;
                });
              session.values.__scroll = scroll;
              session.changed?.();
            }}
          >
            <ToolBoundary
              key={session.id}
              session={session}
              onReady={toolReady}
              onError={toolError}
              onBack={() => navigate('launcher')}
            >
              {view === 'plugin' && pluginSearch.state?.visible && (
                <PluginSearchResults
                  results={pluginSearch.state.results}
                  error={(message) => toast(message, true)}
                />
              )}
              {view === 'launcher' && (
                <Launcher
                  query={query}
                  setQuery={setQuery}
                  input={input}
                  launchInput={launchInput}
                  source={inputSource}
                  capturing={capturing}
                />
              )}
              {view === 'clipboard' && <ClipboardPanel query={query} board={board} />}
              {view === 'scratchpad' && <ScratchpadPanel initialExpression={payload} />}
              {view === 'json' && <JsonTool initial={payload} />}
              {view === 'filesearch' && <FileSearch />}
              {['timestamp', 'encoding', 'uuid'].includes(view) && (
                <ToolsPanel key={view + payload} tool={view} initial={payload} />
              )}
              {view === 'web' && <WebPanel />}
              {view === 'plugins' && <PluginsPanel />}
              {view === 'settings' && <SettingsPanel />}
              {view === 'snippets' && <SnippetsPanel initial={payload} />}
              {view === 'workspaces' && <WorkspacesPanel initial={payload} />}
            </ToolBoundary>
          </main>
          {closingTokens.length > 0 && (
            <div className="handoff-overlay" role="status">
              {t('保存中…')}
            </div>
          )}
          {openingTool && (
            <div className="handoff-overlay" role="status">
              {t('正在加载工具…')}
            </div>
          )}
          {transferring && (
            <div className="handoff-overlay" role="status">
              {t('正在恢复独立窗口…')}
            </div>
          )}
          {notification && (
            <div
              className={`toast ${notification.error ? 'error' : ''}`}
              role="status"
              onClick={() => setNotification(null)}
            >
              {notification.text}
            </div>
          )}
          {dialogSpec && (
            <Modal
              key={dialogSpec.title}
              spec={dialogSpec}
              onResolve={(result) => {
                setDialogSpec(null);
                resolver.current?.(result);
                resolver.current = null;
              }}
            />
          )}
        </div>
      </AppContext.Provider>
    </ToolSessionContext.Provider>
  );
}
