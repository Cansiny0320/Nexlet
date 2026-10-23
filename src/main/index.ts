import { hostProcedure, hostAuthorization, registerHostRpc, type HostRouter } from './host-rpc';
import { localizeCommand } from '../shared/localized-command';
import { t, currentLocale, resolveLocale, setLocale, validLanguage } from '../shared/i18n';
import { CommandRegistry } from './command-registry';
import { DesktopTools, desktopCommands } from './desktop-tools';
import { PanelConfigStore } from './panel-config';
import { PanelTrigger } from './panel-trigger';
import { SelectionService } from './selection';
import { SelectionPlatform } from './selection-platform';
import { SuperPanelController } from './super-panel';
import type { LaunchInput, SearchResponse } from '../shared/launch';
import { ShortcutManager, type ShortcutBinding } from './shortcut-manager';
import {
  validateWebShortcut,
  resolveWebShortcut,
  webSearchCommands,
} from '../shared/web-shortcuts';
import { ToolHandoffs } from './tool-handoff';
import { ToolDrafts } from './tool-drafts';
import { Productivity } from './productivity';
import { SearchPreferences } from './search-preferences';
import { ConfigProfiles } from './config-profile';
import type { ProfileCategory } from '../shared/config-profile';
import { WorkspaceRunner } from './workspaces';
import { executeWorkspaceItem } from './workspace-executor';
import { renderSnippet } from '../shared/productivity';
import { spawn } from 'node:child_process';
import { launchLinuxApplication } from './linux-desktop';
import { LINUX_DESKTOP_NAME } from './linux-startup';
import { createUpdateTransport } from './update-transport';
import { AppUpdates, UpdateSaveBarrier } from './updater';
import {
  webContents,
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  nativeTheme,
  globalShortcut,
  ipcMain,
  clipboard,
  ClipboardItem,
  dialog,
  shell,
  screen,
  protocol,
  systemPreferences,
} from 'electron';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { copyFile, writeFile, readFile, stat } from 'node:fs/promises';
import { launchWindowsApplication } from './launch-windows';
import path from 'node:path';
import { Store } from './store';
import { ClipboardStore } from './clipboard-store';
import { Catalog } from './catalog';
import { CatalogCache } from './catalog-cache';
import { release } from 'node:os';
import { SystemActions } from './system-actions';
import { createSystemExecutor } from './system-executor';
import { Platform } from './platform';
import { ClipboardOcr } from './clipboard-ocr';
import { OcrIndexRunner } from './ocr-index-runner';
import { ClipboardService } from './clipboard';
import { PluginManager } from './plugins';
import { LaunchInputs } from './launch-input';
import { ContentMatcher } from './content-matcher';
import { INPUT_TEXT_LIMIT } from '../shared/launch';
import { Marketplace } from './marketplace';
import { previewFile } from './file-preview';
import { EverythingSearch } from './everything';
import { StartupManager } from './startup';
import { revealWindow, focusOnRestore } from './window-visibility';
import { nativeWindowDrag } from './window-drag';
import {
  BUILTIN_COMMANDS,
  type AppState,
  type Settings,
  type Command,
  type Scratchpad,
} from '../shared/types';
import { searchCommands } from '../shared/search';

const testMode = process.env.NEXLET_TEST_MODE === '1';
if (process.env.NEXLET_USER_DATA) {
  const directory = path.resolve(process.env.NEXLET_USER_DATA);
  mkdirSync(directory, { recursive: true });
  app.setPath('userData', directory);
}
protocol.registerSchemesAsPrivileged([
  { scheme: 'nexlet-plugin', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: 'nexlet-image', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
if (testMode) app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.setName('Nexlet');
if (process.platform === 'linux') app.setDesktopName(LINUX_DESKTOP_NAME);
if (!app.requestSingleInstanceLock()) app.quit();
else void bootstrap();

async function bootstrap() {
  await app.whenReady();
  if (process.platform === 'darwin') app.dock?.hide();
  app.setAppUserModelId('app.nexlet.desktop');
  const store = new Store(app.getPath('userData'));
  const drafts = new ToolDrafts(store);
  const productivity = new Productivity(store);
  const searchPreferences = new SearchPreferences(store);
  const systemLocale = (testMode && process.env.NEXLET_TEST_LOCALE) || app.getLocale();
  setLocale(resolveLocale(store.settings().language, systemLocale));
  ipcMain.handle('app-locale', () => currentLocale());
  const rendererBusy = new Set<number>();
  let hotkeyRunning = false;
  let main: BrowserWindow;
  let panel: SuperPanelController, panelTrigger: PanelTrigger;
  let quitting = false,
    shortcutError: string | null = null,
    tray: Tray | null = null,
    modalCount = 0;
  let cleanedUp = false,
    quitPending: Promise<void> | null = null;
  const closingWindows = new Set<number>(),
    closeApproved = new WeakSet<BrowserWindow>();
  const hosts = new Map<number, BrowserWindow>(),
    views = new Map<number, string>(),
    boards = new Map<number, string[]>();
  const nativeDrags = new WeakMap<BrowserWindow, () => boolean>();
  const html = path.join(__dirname, '../renderer/index.html');
  const notify = (event = 'state') => {
    for (const window of hosts.values())
      if (!window.isDestroyed()) window.webContents.send('host-change', event);
    if (event === 'state') panel?.refresh();
  };
  const workspaces = new WorkspaceRunner(
    (item) =>
      executeWorkspaceItem(item, {
        platform: process.platform,
        openPath: (target) => shell.openPath(target),
        openExternal: (url) => shell.openExternal(url),
        start: (program, args, cwd) =>
          new Promise<void>((resolve, reject) => {
            const child = spawn(program, args, {
              cwd,
              detached: true,
              stdio: 'ignore',
              shell: false,
              windowsHide: false,
            });
            child.once('error', reject);
            child.once('spawn', () => {
              child.unref();
              resolve();
            });
          }),
      }),
    (id, results) => notify('workspace-progress:' + JSON.stringify({ id, results })),
  );
  const platform: Platform = new Platform(
    () => main?.getNativeWindowHandle(),
    async () => {
      if (selectionPlatform.error) throw Error(selectionPlatform.error);
      return selectionPlatform.target();
    },
  );
  const clipStore = new ClipboardStore(store.directory, () => store.settings());
  const clips = new ClipboardService(clipStore, platform, () => notify('clips'));
  const catalog = new Catalog(
    () => notify(),
    process.platform === 'win32' ? new CatalogCache(store.directory) : undefined,
  );
  catalog.restore(store.settings().searchPaths);
  const registry = new CommandRegistry(store, (ids) => catalog.resolveIds(ids));
  const panelConfig = new PanelConfigStore(store, () => registry.pinned());
  const profiles = new ConfigProfiles(store, () => plugins.records());
  const ocrRunner = new OcrIndexRunner(() => plugins.records());
  const clipboardOcr = new ClipboardOcr(
    clipStore,
    (item, signal, progress) => ocrRunner.recognize(item, signal, progress),
    () => {
      notify('ocr-index');
      notify('clips');
    },
  );
  clips.onCaptured = (item) => {
    if (item?.favorite && item.kind === 'image' && store.settings().clipboardOcrFavorites)
      void clipboardOcr.enqueue([item.id], true).catch((error) => notify('error:' + error.message));
  };

  const selectionPlatform = new SelectionPlatform(platform, clips);
  clips.foreground = () => selectionPlatform.target();
  const selection = new SelectionService(selectionPlatform);
  const systemExecutor = createSystemExecutor();
  if (testMode)
    systemExecutor.execute = async () => {
      throw Error(t('测试模式禁止真实系统操作'));
    };
  const systemActions = new SystemActions(process.platform, release(), systemExecutor);
  const inputs = new LaunchInputs((bytes) => {
    const image = nativeImage.createFromBuffer(bytes);
    return image.isEmpty() ? { width: 0, height: 0 } : image.getSize();
  });
  const matcher = new ContentMatcher();
  const plugins = new PluginManager(store, notify, inputs, platform);
  plugins.drafts = drafts;
  const returnToLauncher = async (
    value: Buffer | string | import('../shared/plugin-api').PluginResult,
    caller?: number,
  ) => {
    const input =
      typeof value === 'string'
        ? inputs.setText(main.webContents.id, value, 'input')
        : Buffer.isBuffer(value)
          ? await inputs.captureImage(main.webContents.id, value)
          : await inputs.publish(main.webContents.id, value, caller);
    await plugins.runtime.exitWindow(main, false);
    revealWindow(main);
    main.webContents.send('host-change', 'selection-input:' + input.id);
    views.set(main.id, 'launcher');
    main.webContents.send('host-change', 'plugin-changed');
  };
  const desktopTools = new DesktopTools(html, {
    theme: () => store.settings().theme,
    enabled: (id) => registry.assertEnabled(id),
    launcher: (value) => returnToLauncher(value),
  });
  plugins.returnToLauncher = returnToLauncher;
  const marketplace = new Marketplace(store, plugins);
  plugins.updateOnLaunch = (record, code, signal) =>
    marketplace.prepareUpdate(record, code, signal);
  const files = new EverythingSearch(() => store.settings().fileSearchPaths);
  const startup = new StartupManager(
    app,
    process.platform,
    process.execPath,
    process.env.PORTABLE_EXECUTABLE_FILE,
  );
  const loginLaunch = startup.wasOpenedAtLogin(process.argv);
  const updateMode =
    !app.isPackaged || testMode || !['darwin', 'win32', 'linux'].includes(process.platform)
      ? 'unsupported'
      : process.env.PORTABLE_EXECUTABLE_FILE ||
          (process.platform === 'linux' && !process.env.APPIMAGE)
        ? 'portable'
        : 'automatic';
  const updateTransport =
    updateMode === 'automatic' || (testMode && app.isPackaged) ? createUpdateTransport() : null;
  if (updateTransport) {
    updateTransport.autoDownload = false;
    updateTransport.autoInstallOnAppQuit = false;
    updateTransport.allowPrerelease = false;
    updateTransport.allowDowngrade = false;
  }
  const updateSaves = new UpdateSaveBarrier();
  async function saveForClose(windows: number[]): Promise<() => void> {
    windows = windows.filter((id) => {
      const window = hosts.get(id);
      return window && !window.isDestroyed() && views.get(window.id) !== 'superpanel';
    });
    let token: string | undefined;
    const release = () => {
      if (token)
        for (const id of windows) {
          const window = hosts.get(id);
          if (window && !window.isDestroyed())
            window.webContents.send('host-change', 'close:cancel:' + token);
        }
    };
    try {
      await updateSaves.prepare(windows, (id, value) => {
        token = value;
        hosts.get(id)?.webContents.send('host-change', 'close:prepare:' + value);
      });
      return release;
    } catch (error) {
      release();
      throw error;
    }
  }
  const updates = new AppUpdates(
    app.getVersion(),
    updateMode,
    updateTransport,
    () => {
      if (updates.read().phase === 'error') quitting = false;
      notify('updates:' + JSON.stringify(updates.read()));
    },
    async () => {
      await updateSaves.prepare([...hosts.keys()], (id, token) =>
        hosts.get(id)?.webContents.send('host-change', 'update:prepare:' + token),
      );
      quitting = true;
    },
  );
  const iconFile = path.join(__dirname, '../../assets/icon.png');
  const appIcon = existsSync(iconFile) ? nativeImage.createFromPath(iconFile) : createIcon();
  protocol.handle('nexlet-image', (request) => {
    const url = new URL(request.url);
    if (url.hostname !== 'local' || !/^\/[a-f0-9]{64}\.png$/.test(url.pathname))
      return new Response('Not found', { status: 404 });
    try {
      return new Response(readFileSync(path.join(store.images, url.pathname.slice(1))), {
        headers: { 'Content-Type': 'image/png' },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
  const toolHandoffs = new ToolHandoffs();
  async function createPanelWindow() {
    const window = new BrowserWindow({
      width: 420,
      height: 430,
      minWidth: 300,
      minHeight: 220,
      show: false,
      frame: false,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      backgroundColor: '#f4f4f4',
      title: t('Nexlet · 超级面板'),
      icon: appIcon,
      webPreferences: {
        preload: path.join(__dirname, '../preload/host.cjs'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: false,
      },
    });
    const owner = window.webContents.id;
    hosts.set(owner, window);
    views.set(window.id, 'superpanel');
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (e) => e.preventDefault());
    window.webContents.on('will-attach-webview', (e) => e.preventDefault());
    window.on('closed', () => {
      updateSaves.forget(owner);
      hosts.delete(owner);
      views.delete(window.id);
      rendererBusy.delete(window.id);
      inputs.forget(owner);
      clipStore.forget(owner);
      matcher.forget(owner);
    });
    await window.loadFile(html, { query: { panel: '1' } });
    return window;
  }
  panelTrigger = new PanelTrigger(
    (message) => {
      const point =
        message.point || (typeof message.x === 'number' ? { x: message.x, y: message.y } : null);
      const dip = point && process.platform === 'win32' ? screen.screenToDipPoint(point) : point;
      if (message.type === 'trigger' && dip) void panel.open('mouse', dip);
      else if (message.type === 'release' && dip) panel.release(dip, message.quick);
      else if (message.type === 'pointerDown' && dip) panel.pointerDown(dip);
      else if (message.type === 'move' && dip) panel.move(dip);
    },
    () => notify(),
    () => selectionPlatform.trusted(),
    testMode,
  );
  panel = new SuperPanelController(inputs, selection, selectionPlatform, {
    create: createPanelWindow,
    config: () => panelConfig.read(),
    status: () => panelTrigger.read(),
    commands: () => registry.commands(sourceCommands()),
    theme: () => store.settings().theme,
    busy: () => Object.values(hotkeyState()).some(Boolean),
    changed: () => {
      panelTrigger.setPanel(panel.window?.isVisible() ? panel.window.getBounds() : null);
      notify();
    },
    matches: async (owner, input) => {
      const current = searchState();
      const result = await matcher.search(owner, current.commands, input, '', current.recent);
      const web =
        input.type === 'text'
          ? current.settings.webShortcuts
              .filter((w) => w.type === 'search' && registry.enabled('web:' + w.id, current.config))
              .map((w) => ({
                id: 'web:' + w.id,
                name: w.name,
                subtitle: t('搜索当前选区'),
                kind: 'web' as const,
                keywords: [],
                color: '#3188ef',
                inputId: input.id,
              }))
          : [];
      return [...result.matches.filter((c) => registry.enabled(c.id, current.config)), ...web];
    },
    execute: async (owner, id, input) => {
      if (Object.values(hotkeyState()).some(Boolean))
        throw Error(t('正在处理其他操作，请稍后重试'));
      if (input) inputs.transfer(owner.webContents.id, main.webContents.id, input.id);
      const result = await executeCommand(main, {
        id,
        ...(input ? { inputId: input.id } : { mode: 'open' }),
      });
      deliverResult(result, id);
    },
    toLauncher: async (owner, input) => {
      await plugins.runtime.exitWindow(main);
      if (input) inputs.transfer(owner.webContents.id, main.webContents.id, input.id);
      revealWindow(main);
      main.webContents.send(
        'host-change',
        input ? 'selection-input:' + input.id : 'navigate:launcher',
      );
    },
  });
  function createWindow(
    view = 'launcher',
    detached = false,
    ids: string[] = [],
    initiallyHidden = false,
    transfer = '',
  ) {
    const window = new BrowserWindow({
      width: 800,
      height: view === 'launcher' ? 310 : 600,
      minWidth: 640,
      minHeight: 260,
      show: false,
      frame: false,
      roundedCorners: true,
      resizable: true,
      backgroundColor: '#f4f4f4',
      title: detached
        ? `Nexlet · ${view === 'clipboard' ? t('剪贴板') : view === 'scratchpad' ? t('计算稿纸') : t('工具')}`
        : 'Nexlet',
      icon: appIcon,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, '../preload/host.cjs'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
        spellcheck: false,
      },
    });
    hosts.set(window.webContents.id, window);
    views.set(window.id, view);
    nativeDrags.set(window, nativeWindowDrag(window));
    if (ids.length) boards.set(window.webContents.id, ids);
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    window.webContents.on('will-attach-webview', (event) => event.preventDefault());
    const contentsId = window.webContents.id,
      windowId = window.id;
    focusOnRestore(window);
    window.on('focus', () => {
      if (views.get(window.id) === 'settings') {
        startup.invalidate();
        notify();
      }
    });
    window.once('ready-to-show', () => {
      if (!initiallyHidden) revealWindow(window);
    });
    window.on('close', (event) => {
      if (!detached && !quitting) {
        event.preventDefault();
        window.hide();
        return;
      }
      if (cleanedUp || closeApproved.delete(window)) return;
      event.preventDefault();
      if (quitPending || closingWindows.has(contentsId)) return;
      closingWindows.add(contentsId);
      void saveForClose([contentsId])
        .then((release) => {
          if (window.isDestroyed()) return;
          if (quitPending) {
            release();
            return;
          }
          closeApproved.add(window);
          window.close();
          if (!window.isDestroyed()) release();
        })
        .catch((error) => {
          if (!window.isDestroyed()) {
            revealWindow(window);
            window.webContents.send('host-change', 'error:' + String(error.message || error));
          }
        })
        .finally(() => closingWindows.delete(contentsId));
    });
    window.on('closed', () => {
      updateSaves.forget(contentsId);
      toolHandoffs.forget(contentsId);
      hosts.delete(contentsId);
      rendererBusy.delete(windowId);
      views.delete(windowId);
      boards.delete(contentsId);
      files.forget(contentsId);
      inputs.forget(contentsId);
      clipStore.forget(contentsId);
      matcher.forget(contentsId);
    });
    window.on('blur', () => {
      if (
        !detached &&
        !testMode &&
        !modalCount &&
        store.settings().hideOnBlur &&
        views.get(window.id) === 'launcher'
      )
        window.hide();
    });
    window.on('unresponsive', () => notify('error:' + t('界面暂时无响应，请等待或从托盘重新打开')));
    void window.loadFile(html, {
      query: { view, detached: detached ? '1' : '0', board: ids.length ? '1' : '0', transfer },
    });
    if (detached) window.center();
    return window;
  }
  function position() {
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const bounds = main.getBounds();
    main.setPosition(
      Math.round(area.x + (area.width - bounds.width) / 2),
      Math.round(area.y + Math.max(25, (area.height - bounds.height) * 0.3)),
    );
  }
  async function show() {
    await platform.rememberTarget();
    if (main.isMinimized()) main.restore();
    position();
    revealWindow(main);
    main.webContents.send('host-change', 'focus');
    notify();
    void catalog
      .checkForChanges()
      .catch((error) => console.warn('Application catalog check failed', error));
  }
  function sourceCommands(settings = store.settings()): Command[] {
    return [
      ...BUILTIN_COMMANDS.map(localizeCommand),
      ...productivity.commands(),
      ...desktopCommands(),
      ...catalog.items,
      ...systemActions.commands(),
      ...plugins.commands(),
      ...settings.webShortcuts.map((w) => ({
        id: 'web:' + w.id,
        name: w.name,
        subtitle: w.url,
        kind: 'web' as const,
        keywords: [],
        color: '#3188ef',
      })),
    ];
  }
  const shortcuts = new ShortcutManager(
    testMode ? { register: () => true, unregister: () => {} } : globalShortcut,
    (id) => {
      if (id === 'wake') {
        if (main.isVisible() && main.isFocused()) main.hide();
        else void show();
      } else if (id === '@panel') void panel.open();
      else
        void activateHotkey(id).catch((error) => {
          revealWindow(main);
          notify('error:' + String(error.message || error));
        });
    },
  );
  function bindings(
    config = registry.read(),
    settings = store.settings(),
    panelSettings = panelConfig.read(),
    availableCommands?: Command[],
  ): ShortcutBinding[] {
    const available = new Set(
      (availableCommands || registry.commands(sourceCommands(settings), true, config)).map(
        (c) => c.id,
      ),
    );
    return [
      { id: 'wake', accelerator: settings.shortcut },
      {
        id: '@panel',
        accelerator: panelSettings.shortcut,
        ...(!panelSettings.enabled ? { inactive: t('超级面板已关闭') } : {}),
      },
      ...Object.entries(config.commands)
        .filter(([, p]) => p.shortcut)
        .map(([id, p]) => ({
          id,
          accelerator: p.shortcut!,
          ...(p.disabled
            ? { inactive: t('功能已禁用') }
            : !available.has(id)
              ? { inactive: t('功能暂不可用') }
              : {}),
        })),
    ];
  }
  async function settingsChanged(settings: Settings, next: Settings) {
    if (next.language !== settings.language) {
      setLocale(resolveLocale(next.language, systemLocale));
      for (const contents of webContents.getAllWebContents())
        if (!contents.isDestroyed()) contents.send('app-locale', currentLocale());
      for (const owner of hosts.values()) owner.webContents.send('host-change', 'plugin-changed');
      refreshTray();
      panelTrigger.refreshLocale();
      desktopTools.refreshLocale();
      for (const window of hosts.values()) {
        const view = views.get(window.id);
        if (view && view !== 'launcher' && view !== 'plugin')
          window.setTitle(
            view === 'superpanel'
              ? t('Nexlet · 超级面板')
              : 'Nexlet · ' +
                  t(BUILTIN_COMMANDS.find((c) => c.id === 'tool:' + view)?.name || '工具'),
          );
      }
    }
    updates.setAutomaticChecks(next.autoCheckUpdates);
    if (next.restoreToolSessions !== settings.restoreToolSessions) {
      drafts.persist();
      await drafts.persistResources();
    }
    nativeTheme.themeSource = next.theme;
    if (
      next.language !== settings.language ||
      JSON.stringify(next.searchPaths) !== JSON.stringify(settings.searchPaths)
    )
      void catalog.scan(next.searchPaths);
    await clipStore.prune();
    notify();
    notify('clips');
  }
  async function applyProfile(
    action: 'apply' | 'undo',
    token: string,
    selected: ProfileCategory[],
  ) {
    const previous = store.settings();
    const wrap = (next: import('../shared/config-profile').ProfileCategories, write: () => void) =>
      shortcuts.apply(
        bindings(
          { ...next.commands, revision: registry.read().revision, pinned: next.pinned },
          { ...previous, ...next.settings, webShortcuts: next.webShortcuts },
          { ...next.panel, revision: panelConfig.read().revision },
        ),
        write,
      );
    if (action === 'apply') profiles.apply(token, selected, wrap);
    else profiles.undo(wrap);
    if (
      JSON.stringify(previous.fileSearchPaths) !== JSON.stringify(store.settings().fileSearchPaths)
    )
      await files.reset();
    panelTrigger.configure(panelConfig.read());
    syncShortcuts();
    await settingsChanged(previous, store.settings());
  }
  let shortcutKey = '';
  function syncShortcuts(next = bindings()) {
    const key = JSON.stringify([currentLocale(), next]);
    if (key === shortcutKey) return;
    shortcuts.apply(next, () => {}, false);
    shortcutKey = key;
    shortcutError = shortcuts.status('wake').error || null;
  }
  function hotkeyState() {
    return {
      running: hotkeyRunning,
      dialog: modalCount > 0,
      rendererBusy: rendererBusy.size > 0,
      handoff: toolHandoffs.busy,
      pluginBusy: plugins.runtime.busy,
      capture: desktopTools.busy,
      installing: updates.read().phase === 'installing',
    };
  }
  async function activateHotkey(id: string) {
    if (Object.values(hotkeyState()).some(Boolean) || panel.busy) return;
    hotkeyRunning = true;
    try {
      let input: LaunchInput | undefined;
      if (registry.read().commands[id]?.captureSelection) {
        const captured = await selection.capture(panelConfig.read().excludedApps);
        selectionPlatform.remember(captured.target);
        if (captured.content)
          input = await inputs.captureSelection(main.webContents.id, captured.content);
        if (captured.issue) notify('error:' + captured.issue);
      }
      const result = await executeCommand(main, {
        id,
        ...(input ? { inputId: input.id } : { mode: 'open' }),
      });
      deliverResult(result, id);
      return result;
    } finally {
      hotkeyRunning = false;
    }
  }
  function deliverResult(
    result: { view?: string; payload?: string; needsQuery?: string },
    id: string,
  ) {
    if (result.view) {
      revealWindow(main);
      main.webContents.send(
        'host-change',
        'open-tool:' + JSON.stringify({ view: result.view, payload: result.payload || '' }),
      );
    } else if (result.needsQuery) {
      revealWindow(main);
      main.webContents.send('host-change', 'web-query:' + id);
    }
  }
  async function state(): Promise<AppState> {
    const catalogRevision = catalog.revision;
    const settings = store.settings();
    const config = registry.read();
    const commandCatalog = registry.commands(sourceCommands(settings), true, config),
      commands = commandCatalog.filter((c) => registry.enabled(c.id, config));
    const panelSettings = panelConfig.read();
    syncShortcuts(bindings(config, settings, panelSettings, commandCatalog));
    const pinned = catalog.resolveIds(registry.pinned());
    const recent = catalog.resolveIds(store.get<string[]>('recent', []));
    const visibleIds = new Set([...pinned, ...recent.slice(0, 18)]);
    const decorated = await catalog.withIcons(commands.filter((c) => visibleIds.has(c.id)));
    if (catalogRevision !== catalog.revision) return state();
    const icons = new Map(decorated.map((c) => [c.id, c.icon]));
    return {
      panelConfig: panelSettings,
      panelStatus: panelTrigger.read(),
      commandConfig: config,
      commandCatalog,
      shortcutStatuses: shortcuts.statuses(),
      update: updates.read(),
      version: app.getVersion(),
      platform: process.platform,
      settings,
      startup: startup.cached(),
      pinned,
      recent,
      commands: commands.map((c) => ({ ...c, icon: icons.get(c.id) || c.icon })),
      plugins: plugins.records(),
      shortcutError,
      catalogLoading: catalog.loading,
      catalogRevision,
      searchPreferenceRevision: searchPreferences.revision,
      nativeStatus: platform.status || clips.error,
      canPaste: !!platform.target,
    };
  }
  function searchState() {
    const settings = store.settings(),
      config = registry.read();
    return {
      settings,
      config,
      commands: registry.commands(sourceCommands(settings), false, config),
      recent: catalog.resolveIds(store.get<string[]>('recent', [])),
    };
  }
  function recordRecent(id: string) {
    store.set(
      'recent',
      [id, ...catalog.resolveIds(store.get<string[]>('recent', [])).filter((v) => v !== id)].slice(
        0,
        60,
      ),
    );
    notify();
  }
  async function withDialog<T>(callback: () => Promise<T>): Promise<T> {
    modalCount++;
    plugins.runtime.suspend(true);
    try {
      return await callback();
    } finally {
      modalCount--;
      plugins.runtime.suspend(modalCount > 0);
    }
  }
  function inputObject(payload: unknown): Record<string, any> {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
      throw new Error(t('参数无效'));
    return payload as Record<string, any>;
  }
  function text(value: unknown, max = 1000): string {
    if (typeof value !== 'string' || value.length > max) throw new Error(t('文本参数无效'));
    return value;
  }
  function ids(value: unknown): string[] {
    if (
      !Array.isArray(value) ||
      value.length > 256 ||
      value.some((v) => typeof v !== 'string' || v.length > 150)
    )
      throw new Error(t('记录列表无效'));
    return value;
  }
  function imageData(value: unknown): Buffer {
    const data = text(value, 28 * 1024 * 1024);
    if (!data.startsWith('data:image/png;base64,')) throw new Error(t('仅支持 PNG 图片'));
    const buffer = Buffer.from(data.slice(22), 'base64');
    if (
      buffer.length > 20 * 1024 * 1024 ||
      !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      throw new Error(t('图片数据无效或超过 20 MB'));
    return buffer;
  }
  async function writeImage(data: unknown) {
    await clipboard.write([
      new ClipboardItem({
        'image/png': new Blob([new Uint8Array(imageData(data))], { type: 'image/png' }),
      }),
    ]);
  }
  async function executeCommand(
    window: BrowserWindow,
    args: Record<string, any>,
  ): Promise<{ view?: string; payload?: string; opened?: boolean; needsQuery?: string }> {
    const id = text(args.id, 250);
    registry.assertEnabled(id);
    const current = { settings: store.settings(), commands: registry.commands(sourceCommands()) };
    const snapshot = args.inputId ? inputs.get(window.webContents.id, args.inputId) : undefined;
    const recordLaunch = (commandId: string) => {
      const command = current.commands.find((item) => item.id === commandId);
      if (command && snapshot?.input.type === 'text')
        searchPreferences.learn(snapshot.input.text, snapshot.input.from, command);
      recordRecent(commandId);
    };
    const content =
      snapshot?.input.type === 'text'
        ? snapshot.input.text
        : typeof args.payload === 'string'
          ? text(args.payload, INPUT_TEXT_LIMIT)
          : '';
    if (id.startsWith('capture:')) {
      if (!['capture:region', 'capture:screen'].includes(id)) throw Error(t('截图功能不存在'));
      await desktopTools.screenshot(id === 'capture:screen' ? 'screen' : 'region', 'launcher');
      recordLaunch(id);
      return { opened: true };
    }
    if (id === 'image:pin') {
      let bytes: Buffer | undefined;
      if (snapshot?.input.type === 'image')
        bytes = Buffer.from(await inputs.readResource(snapshot, snapshot.input.image.id));
      else if (
        snapshot?.input.type === 'files' &&
        snapshot.input.files.length === 1 &&
        !snapshot.input.files[0].isDirectory
      )
        bytes = Buffer.from(await inputs.readResource(snapshot, snapshot.input.files[0].id));
      else {
        const image = (await clipboard.read()).find((item) => item.types.includes('image/png'));
        if (image) {
          const blob = await image.getType('image/png');
          if (blob instanceof Blob) bytes = Buffer.from(await blob.arrayBuffer());
        }
      }
      if (!bytes) throw Error(t('请先粘贴或拖入图片，再选择贴图'));
      await desktopTools.pin(bytes);
      window.hide();
      recordLaunch(id);
      return { opened: true };
    }
    if (id === 'input:url') {
      const url = new URL(text(content.trim(), 2048));
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
        throw new Error(t('链接无效'));
      await shell.openExternal(url.href);
      window.hide();
      return { opened: true };
    }
    if (id === 'match:collect') {
      if (!snapshot || snapshot.input.type === 'text') throw new Error(t('请选择图片或文件输入'));
      if (snapshot.input.type === 'image') {
        const bytes = await inputs.readResource(snapshot, snapshot.input.image.id);
        await clipboard.write([
          new ClipboardItem({
            'image/png': new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
          }),
        ]);
      } else {
        for (const resource of snapshot.input.files) {
          if (!existsSync(resource.path!)) throw new Error(t('输入文件已移动或不存在'));
          if (!resource.isDirectory) await inputs.readResource(snapshot, resource.id);
        }
        const paths = snapshot.input.files.map((f) => f.path!);
        await platform.writeFiles(paths);
        const copied = await platform.readFiles();
        if (paths.some((file) => !copied.includes(file)))
          throw new Error(t('系统未接受文件剪贴板，输入已保留，请重试'));
      }
      await clips.capture(true);
      if (clips.error) throw Error(clips.error);
      recordLaunch('tool:clipboard');
      return { view: 'clipboard' };
    }
    if (['match:calc', 'match:json', 'match:clipboard', 'match:timestamp'].includes(id)) {
      if (!snapshot || snapshot.input.type !== 'text') throw new Error(t('请选择文本输入'));
      const view =
        id === 'match:calc'
          ? 'scratchpad'
          : id === 'match:json'
            ? 'json'
            : id === 'match:timestamp'
              ? 'timestamp'
              : 'clipboard';
      recordLaunch('tool:' + view);
      return { view, payload: content };
    }
    const command = current.commands.find((c) => c.id === id);
    if (!command) throw new Error(t('工具或快捷方式已不存在，请刷新索引'));
    if (command.kind === 'snippet' || command.kind === 'workspace') {
      await plugins.runtime.exitWindow(window);
      recordLaunch(id);
      return {
        view: command.kind === 'snippet' ? 'snippets' : 'workspaces',
        payload: JSON.stringify({
          id: id.slice(id.indexOf(':') + 1),
          run: command.kind === 'workspace',
        }),
      };
    }
    if (command.kind === 'system') {
      try {
        const opened = await systemActions.launch(id, (c) =>
          withDialog(async () => {
            const { response } = await dialog.showMessageBox(window, {
              type: 'question',
              buttons: [t('确认'), t('取消')],
              defaultId: 0,
              cancelId: 1,
              noLink: true,
              title: t('系统操作'),
              message: t('确定要执行「{{v0}}」吗？', { v0: c.name }),
              detail:
                c.id === 'system:action:sleep'
                  ? t('电脑将进入睡眠状态。')
                  : t('请先保存正在编辑的内容。'),
            });
            return response === 0;
          }),
        );
        if (opened) {
          recordLaunch(id);
          window.hide();
        }
        return { opened };
      } catch (error) {
        revealWindow(window);
        throw error;
      }
    }
    if (command.kind === 'tool') {
      const view = id.slice(5);
      if (args.mode === 'open') {
        const target =
          [...hosts.values()].find(
            (w) => w !== main && !boards.has(w.webContents.id) && views.get(w.id) === view,
          ) || [...hosts.values()].find((w) => w === main && views.get(w.id) === view);
        if (target) {
          revealWindow(target);
          recordLaunch(id);
          return { opened: true };
        }
      }
      await plugins.runtime.exitWindow(window);
      recordLaunch(id);
      return {
        view,
        ...(snapshot?.input.type === 'text' && snapshot.input.from !== 'input'
          ? { payload: content }
          : {}),
      };
    }
    if (command.kind === 'plugin') {
      if (args.mode === 'open' && plugins.runtime.focus(command.pluginId!, command.feature!)) {
        recordLaunch(id);
        return { opened: true };
      }
      await plugins.launch(command.pluginId!, command.feature!, content, snapshot);
      recordLaunch(id);
      return { opened: true };
    }
    if (command.kind === 'web') {
      const entry = current.settings.webShortcuts.find((w) => 'web:' + w.id === id);
      if (!entry) throw new Error(t('网页不存在'));
      if (
        entry.type === 'search' &&
        typeof args.query !== 'string' &&
        typeof args.payload !== 'string' &&
        snapshot?.input.type !== 'text'
      )
        return { needsQuery: entry.name };
      await shell.openExternal(
        resolveWebShortcut(
          entry,
          typeof args.query === 'string'
            ? text(args.query, 10000)
            : typeof args.payload === 'string'
              ? text(args.payload, 10000)
              : snapshot?.input.type === 'text'
                ? text(content, 10000)
                : '',
        ),
      );
    } else if (process.platform === 'linux' && id.startsWith('linux-app:') && command.path) {
      await launchLinuxApplication(command.path);
    } else if (id.startsWith('uwp:')) {
      launchWindowsApplication(id.slice(4));
    } else if (command.path) {
      if (command.kind === 'local' && !existsSync(command.path))
        throw Error(t('本地文件或目录已移动或不存在'));
      const error = await shell.openPath(command.path);
      if (error) throw new Error(error);
    }
    recordLaunch(id);
    window.hide();
    return { opened: true };
  }
  const closeHostRpc = registerHostRpc(ipcMain, (event) => {
    const { window, authorize } = hostAuthorization(event, hosts, html, () =>
      t('不允许的调用来源'),
    );
    const router: HostRouter = {
      state: hostProcedure<'state'>(authorize, async () => {
        return state();
      }),
      selectionInput: hostProcedure<'selectionInput'>(authorize, async (payload) => {
        {
          const input = inputs.get(event.sender.id, text(payload, 100)).input;
          let preview: string | undefined;
          if (input.type === 'image')
            preview =
              'data:image/png;base64,' +
              Buffer.from(
                await inputs.readResource(inputs.get(event.sender.id, input.id), input.image.id),
              ).toString('base64');
          return { ...input, preview };
        }
      }),
      panel: hostProcedure<'panel'>(authorize, async (payload) => {
        {
          const args = inputObject(payload);
          if (args.action === 'state') return panel.state();
          if (args.action === 'open') {
            void panel.open();
            return true;
          }
          if (args.action === 'permissions') {
            if (process.platform === 'darwin') {
              systemPreferences.isTrustedAccessibilityClient(true);
              await shell.openExternal(
                'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
              );
            }
            return panelTrigger.read();
          }
          if (args.action === 'retry') {
            panelTrigger.retry(panelConfig.read());
            notify();
            return true;
          }
          if (args.action === 'config') {
            if (
              args.patch?.action === 'add' &&
              !registry.commands(sourceCommands(), true).some((c) => c.id === args.patch.commandId)
            )
              throw Error(t('功能已不存在'));
            const next = panelConfig.prepare(inputObject(args.patch));
            shortcuts.apply(bindings(registry.read(), store.settings(), next), () =>
              panelConfig.save(next),
            );
            panelTrigger.configure(next);
            if (!next.enabled) panel.hide();
            notify();
            return next;
          }
          if (!panel.owns(window)) throw Error(t('请在超级面板中执行此操作'));
          if (args.action === 'launch') {
            await panel.launch(text(args.id, 250));
            return true;
          }
          if (args.action === 'launcher') {
            await panel.toLauncher();
            return true;
          }
          if (args.action === 'clear') {
            panel.clear();
            return true;
          }
          if (args.action === 'focus') {
            panel.focus();
            return true;
          }
          if (args.action === 'hide') {
            panel.hide();
            return true;
          }
          throw Error(t('面板操作无效'));
        }
      }),
      catalogIcons: hostProcedure<'catalogIcons'>(authorize, async (payload) => {
        {
          if (
            !Array.isArray(payload) ||
            payload.length > 64 ||
            payload.some((id) => typeof id !== 'string' || id.length > 250)
          )
            throw new Error(t('应用列表无效'));
          const requested = new Set(payload);
          const revision = catalog.revision;
          return (
            await catalog.withIcons(
              [...catalog.items, ...systemActions.commands()].filter((item) =>
                requested.has(item.id),
              ),
            )
          ).map(({ id, icon }) => ({ id, icon, revision }));
        }
      }),
      pluginSession: hostProcedure<'pluginSession'>(authorize, async () => {
        return plugins.runtime.state(window);
      }),
      updateReady: hostProcedure<'updateReady'>(authorize, async (payload) => {
        {
          const args = inputObject(payload);
          updateSaves.ready(event.sender.id, args.token, args.error);
          return true;
        }
      }),
      updateCheck: hostProcedure<'updateCheck'>(authorize, async () => {
        await updates.check();
        return updates.read();
      }),
      updateDownload: hostProcedure<'updateDownload'>(authorize, async () => {
        await updates.download();
        return updates.read();
      }),
      updateInstall: hostProcedure<'updateInstall'>(authorize, async () => {
        await updates.install();
        return true;
      }),
      updatePortable: hostProcedure<'updatePortable'>(authorize, async () => {
        await shell.openExternal(updates.downloadUrl());
        return true;
      }),
      search: hostProcedure<'search'>(authorize, async (payload) => {
        {
          if (typeof payload === 'string') {
            const current = searchState();
            return catalog.withIcons(
              searchCommands(
                current.commands,
                text(payload, 1024),
                current.recent,
                60,
                searchPreferences.weights(payload),
              ),
            );
          }
          const args = inputObject(payload),
            query = text(args.query, INPUT_TEXT_LIMIT);
          const input = args.inputId
            ? inputs.get(event.sender.id, args.inputId).input
            : inputs.setText(event.sender.id, query, args.from === 'paste' ? 'paste' : 'input');
          const current = searchState();
          inputs.get(event.sender.id, input.id);
          const aliases = Object.fromEntries(
            Object.entries(current.config.commands).map(([id, p]) => [id, p.aliases || []]),
          );
          const web = args.inputId
            ? []
            : webSearchCommands(current.settings.webShortcuts, query, aliases).filter((c) =>
                registry.enabled(c.id, current.config),
              );
          const webIds = new Set(web.map((c) => c.id));
          const decorate = (result: SearchResponse): SearchResponse => ({
            ...result,
            matches: result.matches.filter((c) => registry.enabled(c.id, current.config)),
            results: [...web, ...result.results.filter((c) => !webIds.has(c.id))],
          });
          const requestId =
            typeof args.requestId === 'string' ? text(args.requestId, 100) : undefined;
          const result = await matcher.search(
            event.sender.id,
            current.commands,
            input,
            query,
            current.recent,
            requestId
              ? (response) => {
                  if (!event.sender.isDestroyed())
                    event.sender.send('search-progress', {
                      requestId,
                      response: decorate(response),
                    });
                }
              : undefined,
            input.from === 'input' ? searchPreferences.weights(query) : {},
          );
          return result.cancelled ? result : decorate(result);
        }
      }),
      launchInput: hostProcedure<'launchInput'>(authorize, async (payload) => {
        matcher.cancel(event.sender.id);
        return inputs.capture(event.sender.id, payload);
      }),
      clearInput: hostProcedure<'clearInput'>(authorize, async () => {
        matcher.cancel(event.sender.id);
        inputs.clear(event.sender.id);
        return true;
      }),
      continueResult: hostProcedure<'continueResult'>(authorize, async (payload) => {
        matcher.cancel(event.sender.id);
        const input = await inputs.publish(event.sender.id, payload);
        event.sender.send('host-change', 'selection-input:' + input.id);
        return input;
      }),
      launch: hostProcedure<'launch'>(authorize, async (payload) => {
        return executeCommand(window, inputObject(payload));
      }),
      pin: hostProcedure<'pin'>(authorize, async (payload) => {
        {
          const id = text(payload, 250);
          if (!registry.commands(sourceCommands()).some((c) => c.id === id))
            throw Error(t('功能不存在'));
          registry.save(registry.prepare({ action: 'pin', id }));
          notify();
          return true;
        }
      }),
      commandConfig: hostProcedure<'commandConfig'>(authorize, async (payload) => {
        {
          const args = inputObject(payload);
          if (args.action === 'removeRecent') {
            const id = text(args.id, 250);
            store.set(
              'recent',
              catalog.resolveIds(store.get<string[]>('recent', [])).filter((v) => v !== id),
            );
            notify();
            return true;
          }
          if (['patch', 'pin'].includes(args.action)) {
            const id = text(args.id, 250);
            if (
              !registry.commands(sourceCommands(), true).some((c) => c.id === id) &&
              !Object.hasOwn(registry.read().commands, id)
            )
              throw Error(t('功能不存在'));
          }
          const next = registry.prepare(args);
          shortcuts.apply(bindings(next), () => registry.save(next));
          notify();
          return next;
        }
      }),
      localPick: hostProcedure<'localPick'>(authorize, async (payload) => {
        return withDialog(async () => {
          const args = inputObject(payload);
          const result = await dialog.showOpenDialog(window, {
            properties: [args.directory === true ? 'openDirectory' : 'openFile'],
            title: args.directory === true ? t('选择本地目录') : t('选择本地文件'),
          });
          return result.canceled ? null : result.filePaths[0];
        });
      }),
      webShortcut: hostProcedure<'webShortcut'>(authorize, async (payload) => {
        {
          const args = inputObject(payload),
            settings = store.settings();
          let entries = settings.webShortcuts;
          if (args.action === 'remove')
            entries = entries.filter((w) => w.id !== text(args.id, 100));
          else if (args.action === 'save') {
            const entry = validateWebShortcut(args.entry);
            if (entries.some((w) => w.id === entry.id))
              entries = entries.map((w) => (w.id === entry.id ? entry : w));
            else {
              if (entries.length >= 100) throw Error(t('最多保存 100 个网页'));
              entries = [...entries, entry];
            }
          } else throw Error(t('网页操作无效'));
          const next = { ...settings, webShortcuts: entries };
          shortcuts.apply(bindings(registry.read(), next), () => store.set('settings', next));
          notify();
          return true;
        }
      }),
      productivity: hostProcedure<'productivity'>(authorize, async (payload) => {
        const args = inputObject(payload);
        if (args.action === 'read') return productivity.read();
        if (args.action !== 'save') throw Error(t('配置格式无效'));
        const next = productivity.save(args.value);
        syncShortcuts();
        notify();
        return next;
      }),
      snippetPreview: hostProcedure<'snippetPreview'>(authorize, async (payload) => {
        const args = inputObject(payload),
          body = text(args.body, 50_000),
          values = inputObject(args.values);
        for (const value of Object.values(values)) text(value, 50_000);
        return renderSnippet(
          body,
          values,
          /\{\{\s*clipboard\s*\}\}/.test(body) ? await clipboard.readText() : '',
        );
      }),
      workspaceRun: hostProcedure<'workspaceRun'>(authorize, async (payload) => {
        const args = inputObject(payload),
          id = text(args.id, 100);
        if (args.action === 'cancel') {
          workspaces.cancel(id);
          return workspaces.read(id);
        }
        if (args.action === 'status') return workspaces.read(id);
        if (args.action !== 'run') throw Error(t('参数无效'));
        const workspace = productivity.read().workspaces.find((item) => item.id === id);
        if (!workspace) throw Error(t('工作区已不存在'));
        const selected = args.items === undefined ? undefined : ids(args.items);
        if (selected?.some((id) => !workspace.items.some((item) => item.id === id)))
          throw Error(t('工作区项目已不存在'));
        return workspaces.run(workspace, selected);
      }),
      toolDraft: hostProcedure<'toolDraft'>(authorize, async (payload) => {
        const args = inputObject(payload);
        if (args.action === 'clear') {
          await plugins.runtime.close();
          await drafts.clear();
          notify('drafts-cleared');
          return true;
        }
        const view = text(args.view, 100);
        if (!BUILTIN_COMMANDS.some((command) => command.id === 'tool:' + view))
          throw Error(t('工具状态无效'));
        const key = (window === main ? 'main:' : `window:${window.id}:`) + view;
        if (args.action === 'read') return drafts.read(key);
        if (args.action === 'save') {
          drafts.save(key, args.state);
          return true;
        }
        throw Error(t('工具状态无效'));
      }),
      toolSession: hostProcedure<'toolSession'>(authorize, async (payload) => {
        {
          const args = inputObject(payload),
            token = text(args.token, 100);
          if (args.action === 'read') return toolHandoffs.read(event.sender.id, token);
          if (args.action === 'ready') {
            toolHandoffs.acknowledge(
              event.sender.id,
              token,
              args.error ? text(args.error, 1000) : undefined,
            );
            return true;
          }
          throw Error(t('交接操作无效'));
        }
      }),
      window: hostProcedure<'window'>(authorize, async (payload) => {
        {
          const args = inputObject(payload);
          if (args.action === 'pluginSearch') {
            if (args.operation === 'read') return plugins.sdk.commands?.read(window) ?? null;
            return plugins.sdk.commands?.input(
              window,
              args.text,
              args.operation === 'select' ? args.id : undefined,
            );
          }
          if (args.action === 'busy') {
            if (args.value === true) rendererBusy.add(window.id);
            else rendererBusy.delete(window.id);
          } else if (args.action === 'exitPlugin') await plugins.runtime.exitWindow(window);
          else if (args.action === 'overlay') {
            plugins.runtime.overlay(window, args.visible === true);
          } else if (args.action === 'hide') window.hide();
          else if (args.action === 'close') {
            if (window === main) window.hide();
            else window.close();
          } else if (args.action === 'minimize') window.minimize();
          else if (args.action === 'maximize') {
            window.isMaximized() ? window.unmaximize() : window.maximize();
          } else if (args.action === 'pin') {
            window.setAlwaysOnTop(!window.isAlwaysOnTop());
            return window.isAlwaysOnTop();
          } else if (args.action === 'dragStart')
            return views.get(window.id) === 'launcher' && !window.isMaximized()
              ? (window.getPosition() as [number, number])
              : null;
          else if (args.action === 'dragMove') {
            if (
              typeof args.x !== 'number' ||
              typeof args.y !== 'number' ||
              !Number.isFinite(args.x) ||
              !Number.isFinite(args.y)
            )
              throw new Error(t('窗口位置无效'));
            if (views.get(window.id) === 'launcher' && !window.isMaximized()) {
              if (nativeDrags.get(window)?.()) return true;
              window.setPosition(Math.round(args.x), Math.round(args.y));
            }
            return false;
          } else if (args.action === 'view') {
            const view = text(args.view, 50);
            if (
              ![
                'launcher',
                'plugin',
                'clipboard',
                'scratchpad',
                'plugins',
                'settings',
                'web',
                'json',
                'timestamp',
                'encoding',
                'uuid',
                'filesearch',
                'snippets',
                'workspaces',
              ].includes(view)
            )
              throw new Error(t('视图无效'));
            views.set(window.id, view);
            if (view === 'settings') {
              startup.invalidate();
              notify();
            }
            if (!window.isMaximized()) {
              const bounds = window.getBounds();
              const work = screen.getDisplayMatching(bounds).workArea;
              const height = Math.min(view === 'launcher' ? 310 : 600, work.height);
              window.setBounds({
                ...bounds,
                height,
                y: Math.min(bounds.y, work.y + work.height - height),
              });
            }
          } else if (args.action === 'height' && views.get(window.id) === 'launcher') {
            const height = Math.max(270, Math.min(720, Number(args.height) || 310));
            const bounds = window.getBounds();
            const work = screen.getDisplayMatching(bounds).workArea;
            window.setBounds({
              ...bounds,
              height: Math.min(height, work.height),
              y: Math.min(bounds.y, work.y + work.height - Math.min(height, work.height)),
            });
          } else if (args.action === 'detach') {
            const view = text(args.view, 50);
            if (view === 'plugin') {
              await plugins.runtime.detach(window);
              return true;
            }
            if (
              ![
                'clipboard',
                'scratchpad',
                'json',
                'timestamp',
                'encoding',
                'uuid',
                'filesearch',
                'snippets',
                'workspaces',
              ].includes(view)
            )
              throw new Error(t('此视图不能分离'));
            if (views.get(window.id) !== view || args.snapshot?.view !== view)
              throw Error(t('工具视图已改变'));
            await toolHandoffs.transfer(event.sender.id, args.snapshot, (token) => {
              const target = createWindow(view, true, [], true, token);
              return {
                id: target.webContents.id,
                show: () => revealWindow(target),
                destroy: () => {
                  if (!target.isDestroyed()) target.destroy();
                },
              };
            });
          }
          return true;
        }
      }),
      clearSearchPreferences: hostProcedure<'clearSearchPreferences'>(authorize, async () => {
        searchPreferences.clear();
        notify();
        return true;
      }),
      configProfile: hostProcedure<'configProfile'>(authorize, async (payload) => {
        const args = inputObject(payload);
        if (args.action === 'preview') return profiles.preview(text(args.text, 4 * 1024 * 1024));
        if (args.action === 'apply' || args.action === 'undo') {
          await applyProfile(args.action, args.token, args.categories);
          return true;
        }
        return withDialog(async () => {
          if (args.action === 'export') {
            const result = await dialog.showSaveDialog(window, {
              defaultPath: 'Nexlet.nexlet.jsonc',
              filters: [{ name: 'Nexlet JSONC', extensions: ['jsonc'] }],
            });
            if (result.canceled || !result.filePath) return false;
            await writeFile(result.filePath, profiles.export(), 'utf8');
            return true;
          }
          if (args.action === 'open') {
            const result = await dialog.showOpenDialog(window, {
              properties: ['openFile'],
              filters: [{ name: 'Nexlet JSONC', extensions: ['jsonc', 'json'] }],
            });
            if (result.canceled) return null;
            const filename = result.filePaths[0];
            if ((await stat(filename)).size > 4 * 1024 * 1024)
              throw Error(t('配置文件不能超过 4 MB'));
            return readFile(filename, 'utf8');
          }
          throw Error(t('操作无效'));
        });
      }),
      settings: hostProcedure<'settings'>(authorize, async (payload) => {
        {
          const update = inputObject(payload),
            settings = store.settings();
          const next: Settings = { ...settings };
          if ('shortcut' in update) next.shortcut = text(update.shortcut, 80);
          if ('language' in update) {
            if (!validLanguage(update.language)) throw new Error(t('语言无效'));
            next.language = update.language;
          }
          if ('theme' in update) {
            if (!['light', 'dark', 'system'].includes(update.theme)) throw new Error(t('主题无效'));
            next.theme = update.theme;
          }
          for (const key of [
            'hideOnBlur',
            'clipboardEnabled',
            'autoCheckUpdates',
            'restoreToolSessions',
            'clipboardOcrFavorites',
          ] as const)
            if (key in update) {
              if (typeof update[key] !== 'boolean') throw new Error(t('开关无效'));
              next[key] = update[key];
            }
          if ('clipboardPausedUntil' in update) {
            if (
              !Number.isSafeInteger(update.clipboardPausedUntil) ||
              update.clipboardPausedUntil < 0 ||
              update.clipboardPausedUntil > Date.now() + 86400000
            )
              throw Error(t('暂停时间无效'));
            next.clipboardPausedUntil = update.clipboardPausedUntil;
          }
          if ('clipboardExcludedApps' in update) {
            if (
              !Array.isArray(update.clipboardExcludedApps) ||
              update.clipboardExcludedApps.length > 100
            )
              throw Error(t('最多排除 100 个应用'));
            next.clipboardExcludedApps = [
              ...new Set<string>(
                update.clipboardExcludedApps
                  .map((value: unknown) => text(value, 32767).trim())
                  .filter(Boolean),
              ),
            ];
          }
          for (const key of ['maxClipboardItems', 'retentionDays'] as const)
            if (key in update) {
              const n = update[key];
              if (!Number.isInteger(n) || n < 1 || n > (key === 'retentionDays' ? 3650 : 5000))
                throw new Error(t('保留数量或天数无效'));
              next[key] = n;
            }
          if ('searchPaths' in update) {
            if (
              !Array.isArray(update.searchPaths) ||
              update.searchPaths.length > 20 ||
              update.searchPaths.some((p: unknown) => typeof p !== 'string' || !path.isAbsolute(p))
            )
              throw new Error(t('搜索路径无效'));
            next.searchPaths = update.searchPaths;
          }
          if ('fileSearchPaths' in update) {
            if (
              !Array.isArray(update.fileSearchPaths) ||
              update.fileSearchPaths.length > 26 ||
              update.fileSearchPaths.some(
                (p: unknown) => typeof p !== 'string' || !path.isAbsolute(p) || /[\0\r\n]/.test(p),
              )
            )
              throw new Error(t('索引目录无效'));
            next.fileSearchPaths = [...new Set(update.fileSearchPaths)] as string[];
            await files.reset();
          }
          if ('webShortcuts' in update) {
            if (!Array.isArray(update.webShortcuts) || update.webShortcuts.length > 100)
              throw Error(t('网页快捷方式过多'));
            next.webShortcuts = update.webShortcuts.map(validateWebShortcut);
            if (new Set(next.webShortcuts.map((w) => w.id)).size !== next.webShortcuts.length)
              throw Error(t('网页 ID 重复'));
          }
          shortcuts.apply(bindings(registry.read(), next), () => store.set('settings', next));
          await settingsChanged(settings, next);
          return next;
        }
      }),
      rescan: hostProcedure<'rescan'>(authorize, async () => {
        await catalog.scan(store.settings().searchPaths);
        return true;
      }),
      startup: hostProcedure<'startup'>(authorize, async (payload) => {
        {
          if (typeof payload !== 'boolean') throw new Error(t('自启动开关无效'));
          const result = startup.set(payload);
          notify();
          return result;
        }
      }),
      pickSearchPath: hostProcedure<'pickSearchPath'>(authorize, async () => {
        return withDialog(async () => {
          const result = await dialog.showOpenDialog(window, {
            properties: ['openDirectory'],
            title: t('选择应用或快捷方式目录'),
          });
          return result.canceled ? null : result.filePaths[0];
        });
      }),
      clips: hostProcedure<'clips'>(authorize, async (payload) => {
        {
          const args = payload ? inputObject(payload) : {};
          const query = typeof args.query === 'string' ? args.query.slice(0, 1024) : '';
          const kind = typeof args.kind === 'string' ? args.kind : 'all';
          const board = boards.get(event.sender.id);
          const items = await clipStore.clips(query, kind);
          authorize();
          return items.filter((i) => !board || board.includes(i.id));
        }
      }),
      clipIndex: hostProcedure<'clipIndex'>(authorize, async (payload) => {
        {
          const args = payload ? inputObject(payload) : {};
          const result = await clipStore.clipIndex(
            typeof args.query === 'string' ? args.query.slice(0, 1024) : '',
            typeof args.kind === 'string' ? args.kind : 'all',
            boards.get(event.sender.id),
            event.sender.id,
          );
          authorize();
          return result;
        }
      }),
      clipPage: hostProcedure<'clipPage'>(authorize, async (payload) => {
        {
          const args = inputObject(payload),
            selected = ids(args.ids),
            board = boards.get(event.sender.id);
          if (
            !Number.isSafeInteger(args.revision) ||
            args.revision < 0 ||
            (board && selected.some((id) => !board.includes(id)))
          )
            throw Error(t('参数无效'));
          const result = await clipStore.clipPage(selected, args.revision);
          authorize();
          return result;
        }
      }),
      clipDetail: hostProcedure<'clipDetail'>(authorize, async (payload) => {
        {
          const id = text(payload, 150),
            board = boards.get(event.sender.id);
          if (board && !board.includes(id)) throw Error(t('参数无效'));
          const result = await clipStore.clip(id);
          authorize();
          return result;
        }
      }),
      clipOcr: hostProcedure<'clipOcr'>(authorize, async (payload) => {
        const args = inputObject(payload);
        if (args.action === 'status') return clipboardOcr.read();
        if (args.action === 'run') {
          await ocrRunner.available();
          await clipboardOcr.enqueue(ids(args.ids));
        } else if (args.action === 'cancel') clipboardOcr.cancel(ids(args.ids));
        else if (args.action === 'clear') await clipboardOcr.clear(ids(args.ids));
        else if (args.action === 'import') {
          await ocrRunner.available();
          await withDialog(async () => {
            const result = await dialog.showOpenDialog(window, {
              properties: ['openFile', 'multiSelections'],
              filters: [{ name: t('图片'), extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }],
            });
            if (result.canceled) return;
            if (result.filePaths.length > 50) throw Error(t('每次最多添加 50 张图片'));
            for (const file of result.filePaths) {
              if ((await stat(file)).size > 20 * 1024 * 1024)
                throw Error(t('图片超过 20 MB，无法导入'));
              const item = await clips.importImage(new Uint8Array(await readFile(file)));
              await clipboardOcr.enqueue([item.id]);
            }
          });
        } else throw Error(t('操作无效'));
        return clipboardOcr.read();
      }),
      clipCleanup: hostProcedure<'clipCleanup'>(authorize, async (payload) => {
        const args = inputObject(payload);
        if (typeof args.includeFavorites !== 'boolean') throw Error(t('参数无效'));
        const range = await clipStore.clipRange(args.start, args.end, args.includeFavorites);
        if (args.action === 'preview') return { count: range.ids.length, revision: range.revision };
        if (args.action !== 'apply') throw Error(t('操作无效'));
        clipboardOcr.cancel(range.ids);
        const count = await clipStore.clearClipRange(
          args.start,
          args.end,
          args.includeFavorites,
          args.revision,
        );
        notify('clips');
        return { count, revision: range.revision };
      }),
      clipAction: hostProcedure<'clipAction'>(authorize, async (payload) => {
        {
          const args = inputObject(payload),
            operation = text(args.action, 30);
          if (operation === 'writeText' || operation === 'pasteText') {
            await clipboard.writeText(text(args.text, 2 * 1024 * 1024));
            if (operation === 'pasteText') {
              window.hide();
              try {
                await platform.paste();
              } catch (error) {
                revealWindow(window);
                throw error;
              }
            }
            return true;
          }
          if (operation === 'writeImage') {
            await writeImage(args.data);
            return true;
          }
          if (operation === 'writeFiles') {
            const files = args.files;
            if (
              !Array.isArray(files) ||
              !files.length ||
              files.length > 256 ||
              files.some((p) => typeof p !== 'string' || !path.isAbsolute(p) || !existsSync(p))
            )
              throw new Error(t('文件已移动或不存在'));
            await platform.writeFiles(files);
            return true;
          }
          if (operation === 'saveImage') {
            const data = imageData(args.data);
            return withDialog(async () => {
              const result = await dialog.showSaveDialog(window, {
                defaultPath: 'Nexlet-image.png',
                filters: [{ name: t('PNG 图片'), extensions: ['png'] }],
              });
              if (result.canceled || !result.filePath) return false;
              await writeFile(result.filePath, data);
              return true;
            });
          }
          if (operation === 'capture') {
            await clips.capture(true);
            return true;
          }
          if (operation === 'clear') {
            clipboardOcr.cancel();
            await clipStore.clearClips(args.includeFavorites === true);
            notify('clips');
            return true;
          }
          const selected = ids(args.ids);
          if (operation === 'copy' || operation === 'copyPlain')
            await clips.copy(selected, operation === 'copyPlain');
          else if (operation === 'paste' || operation === 'pastePlain') {
            await clips.copy(selected, operation === 'pastePlain');
            window.hide();
            try {
              await platform.paste();
            } catch (error) {
              window.show();
              throw error;
            }
          } else if (operation === 'continue') {
            const item = selected.length === 1 ? await clipStore.clip(selected[0]) : undefined;
            if (!item) throw Error(t('请选择一条记录'));
            const result: import('../shared/launch').ToolResult =
              item.kind === 'text'
                ? { type: 'text', text: item.text, ...(item.html ? { html: item.html } : {}) }
                : item.kind === 'files'
                  ? { type: 'files', paths: item.files || [] }
                  : {
                      type: 'image',
                      data:
                        'data:image/png;base64,' +
                        (await readFile(item.imagePath!)).toString('base64'),
                    };
            const input = await inputs.publish(event.sender.id, result);
            event.sender.send('host-change', 'selection-input:' + input.id);
          } else if (operation === 'delete') {
            clipboardOcr.cancel(selected);
            await clipStore.deleteClips(selected);
            notify('clips');
          } else if (operation === 'favorite') {
            if (typeof args.value !== 'boolean') throw new Error(t('收藏值无效'));
            for (const id of selected) await clipStore.favorite(id, args.value);
            if (args.value && store.settings().clipboardOcrFavorites)
              await clipboardOcr.enqueue(selected, true);
            notify('clips');
          } else if (operation === 'station') {
            const popup = createWindow('clipboard', true, selected);
            popup.setAlwaysOnTop(true);
          } else if (operation === 'save') {
            const item = selected.length === 1 ? await clipStore.clip(selected[0]) : undefined;
            if (!item?.imagePath) throw new Error(t('请选择一张图片'));
            return withDialog(async () => {
              const result = await dialog.showSaveDialog(window, {
                defaultPath: 'Nexlet-clipboard.png',
                filters: [{ name: t('PNG 图片'), extensions: ['png'] }],
              });
              if (result.canceled || !result.filePath) return false;
              await copyFile(item.imagePath!, result.filePath);
              return true;
            });
          } else throw new Error(t('操作无效'));
          return true;
        }
      }),
      pads: hostProcedure<'pads'>(authorize, async () => {
        return store.pads();
      }),
      savePad: hostProcedure<'savePad'>(authorize, async (payload) => {
        {
          const args = inputObject(payload),
            pad = inputObject(args.pad) as unknown as Scratchpad;
          if (
            !/^[a-zA-Z0-9-]{1,80}$/.test(pad.id) ||
            typeof pad.name !== 'string' ||
            pad.name.length > 100 ||
            typeof pad.locked !== 'boolean' ||
            !/^#[a-fA-F0-9]{6}$/.test(pad.color) ||
            !Array.isArray(pad.lines) ||
            pad.lines.length > 1000
          )
            throw new Error(t('稿纸数据无效'));
          if (
            pad.lines.some(
              (line) =>
                typeof line.id !== 'string' ||
                line.id.length > 80 ||
                typeof line.expression !== 'string' ||
                line.expression.length > 512 ||
                typeof line.note !== 'string' ||
                line.note.length > 1000,
            )
          )
            throw new Error(t('公式或备注过长'));
          const pads = store.pads(),
            old = pads.find((p) => p.id === pad.id);
          if (old && args.expectedUpdatedAt !== old.updatedAt)
            throw new Error(t('稿纸已在其他窗口修改，请重新打开后再编辑'));
          if (old?.locked && JSON.stringify(old.lines) !== JSON.stringify(pad.lines))
            throw new Error(t('稿纸已锁定'));
          const saved = {
            ...pad,
            createdAt: old?.createdAt || Date.now(),
            updatedAt: Math.max(Date.now(), (old?.updatedAt || 0) + 1),
          };
          const next = old ? pads.map((p) => (p.id === saved.id ? saved : p)) : [saved, ...pads];
          if (next.length > 500) throw new Error(t('最多保存 500 份稿纸'));
          store.set('pads', next);
          notify('pads');
          return saved;
        }
      }),
      deletePad: hostProcedure<'deletePad'>(authorize, async (payload) => {
        {
          const id = text(payload, 80),
            pads = store.pads();
          if (pads.find((p) => p.id === id)?.locked) throw new Error(t('请先解锁稿纸'));
          store.set(
            'pads',
            pads.filter((p) => p.id !== id),
          );
          notify('pads');
          return true;
        }
      }),
      exportPad: hostProcedure<'exportPad'>(authorize, async (payload) => {
        await writeImage(inputObject(payload).data);
        return true;
      }),
      pluginInstall: hostProcedure<'pluginInstall'>(authorize, async (payload) => {
        return withDialog(() => plugins.install(window, inputObject(payload).development === true));
      }),
      pluginToggle: hostProcedure<'pluginToggle'>(authorize, async (payload) => {
        {
          const args = inputObject(payload);
          if (typeof args.enabled !== 'boolean') throw new Error(t('状态无效'));
          if (args.id === 'org.nexlet.ocr' && !args.enabled) clipboardOcr.cancel();
          await plugins.toggle(text(args.id, 100), args.enabled);
          return true;
        }
      }),
      pluginRemove: hostProcedure<'pluginRemove'>(authorize, async (payload) => {
        {
          const args = inputObject(payload);
          if (args.id === 'org.nexlet.ocr') clipboardOcr.cancel();
          await plugins.remove(text(args.id, 100), args.deleteData === true);
          return true;
        }
      }),
      pluginInspect: hostProcedure<'pluginInspect'>(authorize, async () => {
        return plugins.records();
      }),
      marketplace: hostProcedure<'marketplace'>(authorize, async (payload) => {
        return marketplace.list(payload === true);
      }),
      marketInstall: hostProcedure<'marketInstall'>(authorize, async (payload) => {
        return withDialog(() => marketplace.install(text(payload, 100)));
      }),
      fileSearch: hostProcedure<'fileSearch'>(authorize, async (payload) => {
        return files.search(event.sender.id, text(payload, 1024));
      }),
      fileSearchStatus: hostProcedure<'fileSearchStatus'>(authorize, async () => {
        return files.status();
      }),
      fileBrowse: hostProcedure<'fileBrowse'>(authorize, async (payload) => {
        {
          const args = inputObject(payload);
          return files.browse(
            event.sender.id,
            text(args.path, 32767),
            text(args.filter ?? '', 1024),
            typeof args.cursor === 'string' ? text(args.cursor, 100) : undefined,
          );
        }
      }),
      filePreview: hostProcedure<'filePreview'>(authorize, async (payload) => {
        const target = text(payload, 32767);
        await files.info(event.sender.id, target);
        const result = await previewFile(target);
        await files.info(event.sender.id, target);
        authorize();
        return result;
      }),
      fileInfo: hostProcedure<'fileInfo'>(authorize, async (payload) => {
        return files.info(event.sender.id, text(payload, 32767));
      }),
      fileAction: hostProcedure<'fileAction'>(authorize, async (payload) => {
        {
          const args = inputObject(payload);
          return files.action(
            event.sender.id,
            text(args.action, 30),
            typeof args.path === 'string' ? text(args.path, 32767) : undefined,
          );
        }
      }),
      openData: hostProcedure<'openData'>(authorize, async () => {
        {
          const error = await shell.openPath(store.directory);
          if (error) throw new Error(error);
          return true;
        }
      }),
    };
    return router;
  });
  main = createWindow('launcher', false, [], loginLaunch);
  position();
  nativeTheme.themeSource = store.settings().theme;
  plugins.runtime.configure({
    main: () => main,
    createDetached: () => createWindow('plugin', true, [], true),
    changed: (owner) => {
      if (!owner.isDestroyed()) {
        const current = plugins.runtime.state(owner);
        views.set(owner.id, current ? 'plugin' : 'launcher');
        owner.webContents.send('host-change', 'plugin-changed');
      }
    },
    error: (message) => notify('error:' + message),
  });
  function refreshTray() {
    tray?.setContextMenu(
      Menu.buildFromTemplate([
        { label: t('打开 Nexlet'), click: () => void show() },
        { label: t('超级面板'), click: () => void panel.open() },
        {
          label: t('剪贴板'),
          click: () =>
            void activateHotkey('tool:clipboard').catch((error) =>
              notify('error:' + error.message),
            ),
        },
        {
          label: t('计算稿纸'),
          click: () =>
            void activateHotkey('tool:scratchpad').catch((error) =>
              notify('error:' + error.message),
            ),
        },
        { type: 'separator' },
        {
          label: t('退出 Nexlet'),
          click: () => {
            quitting = true;
            app.quit();
          },
        },
      ]),
    );
  }
  if (!testMode) {
    tray = new Tray(appIcon.resize({ width: 20, height: 20 }));
    tray.setToolTip('Nexlet');
    refreshTray();
    tray.on('click', () => void show());
    clips.start();
  }
  syncShortcuts();
  panelTrigger.configure(panelConfig.read());
  const panelBusyTimer = setInterval(
    () =>
      panelTrigger.setBusy(Object.values(hotkeyState()).some(Boolean) || panel.busy, () =>
        panelConfig.read(),
      ),
    100,
  );
  panelBusyTimer.unref();
  catalog.startAutoRefresh();
  // Integration tests can hold the refresh to inspect the restored first frame.
  if (!testMode || process.env.NEXLET_TEST_DEFER_CATALOG_SCAN !== '1')
    void catalog.scan(store.settings().searchPaths);
  app.on('second-instance', () => void show());
  app.on('activate', () => void show());
  app.on('window-all-closed', () => {});
  // Let AppKit finish canceling Cmd+Q before requesting the final quit on a new turn.
  app.on('before-quit', (event) => {
    if (cleanedUp) return;
    event.preventDefault();
    if (quitPending) return;
    quitting = true;
    quitPending = (async () => {
      // Keep all services and windows alive until every editor confirms its save.
      await saveForClose([...hosts.keys()]);
      workspaces.close();
      clipboardOcr.close();
      desktopTools.close();
      clearInterval(panelBusyTimer);
      panelTrigger.close();
      panel.close();
      updates.setAutomaticChecks(false);
      await clips.close();
      shortcuts.close();
      matcher.close();
      if (tray && !tray.isDestroyed()) tray.destroy();
      await Promise.allSettled([plugins.close(), files.close(), clipStore.close()]);
      inputs.close();
      cleanedUp = true;
      setImmediate(() => app.quit());
    })()
      .catch((error) => {
        quitting = false;
        notify('error:' + String(error.message || error));
        if (!main.isDestroyed()) revealWindow(main);
      })
      .finally(() => {
        quitPending = null;
      });
  });
  app.once('will-quit', () => {
    closeHostRpc();
    catalog.close();
    store.close();
  });
  updates.setAutomaticChecks(store.settings().autoCheckUpdates);
  if (testMode)
    (globalThis as any).__nexlet = {
      desktopTools,
      panel,
      panelConfig,
      panelTrigger,
      selection,
      selectionPlatform,
      registry,
      shortcuts,
      hotkeyState,
      activateHotkey,
      executeCommand,
      updates,
      autoUpdater: updateTransport,
      store,
      productivity,
      workspaces,
      drafts,
      clipStore,
      clipboardOcr,
      ocrRunner,
      startup,
      clips,
      platform,
      catalog,
      systemActions,
      systemExecutor,
      plugins,
      marketplace,
      files,
      main,
      show,
      hosts,
      inputs,
      matcher,
      toolHandoffs,
    };
}

function createIcon() {
  const size = 32,
    data = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      const letter =
        (x >= 8 && x <= 11 && y >= 7 && y <= 24) ||
        (x >= 21 && x <= 24 && y >= 7 && y <= 24) ||
        (y >= 7 && y <= 24 && Math.abs(x - (9 + ((y - 7) * 14) / 17)) <= 2);
      data[offset] = letter ? 255 : 245;
      data[offset + 1] = letter ? 255 : 94;
      data[offset + 2] = letter ? 255 : 101;
      data[offset + 3] = 255;
    }
  return nativeImage.createFromBitmap(data, { width: size, height: size });
}
