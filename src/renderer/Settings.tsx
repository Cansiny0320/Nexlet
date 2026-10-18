import { t } from '../shared/i18n';
import { SettingsSelect } from './components/settings-select';
import { ShortcutInput } from './components/shortcut-input';
import { formatShortcut } from '../shared/shortcut-display';
import { Button } from './components/ui/button';
import { Switch } from './components/ui/switch';
import { PanelSettings } from './PanelSettings';
import { CommandManager } from './CommandManager';
import { UpdatePanel } from './UpdatePanel';
import { useState, useEffect } from 'react';
import {
  Keyboard,
  Palette,
  ClipboardList,
  FolderSearch,
  FolderOpen,
  Plus,
  X,
  RefreshCw,
  Monitor,
} from 'lucide-react';
import { api, useApp, errorText, PanelHeader } from './common';
import { SettingsIconButton as IconButton } from './components/settings-icon-button';
import type { Settings as SettingsType } from '../shared/types';

export function SettingsPanel() {
  const { state, toast, refresh } = useApp();
  const [shortcut, setShortcut] = useState(state.settings.shortcut),
    [recording, setRecording] = useState(false),
    [startupBusy, setStartupBusy] = useState(false);
  useEffect(() => {
    setShortcut(state.settings.shortcut);
  }, [state.settings.shortcut]);
  const update = async (patch: Partial<SettingsType>) => {
    try {
      await api('settings', patch);
      toast(t('设置已保存'));
    } catch (e) {
      toast(errorText(e), true);
    }
  };
  const mac = state.platform === 'darwin',
    linux = state.platform === 'linux';
  const coexist = state.platform === 'darwin' ? 'Control+Alt+Space' : 'Ctrl+Alt+Space';
  return (
    <div className="standard-panel scroll-panel settings-panel">
      <PanelHeader title={t('设置')} />
      <div className="settings-section-title">
        <Keyboard size={17} />
        {t('快捷键与窗口')}
      </div>
      <div className="setting-row">
        <div>
          <strong>{t('全局唤起')}</strong>
        </div>
        <div className="shortcut-control">
          <ShortcutInput
            platform={state.platform}
            aria-label={t('全局快捷键')}
            value={recording ? t('按下组合键…') : shortcut}
            readOnly={recording}
            onValueChange={setShortcut}
            onKeyDown={(e) => {
              if (!recording) return;
              e.preventDefault();
              if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
              const keys = [
                e.ctrlKey ? 'Control' : null,
                e.metaKey ? (mac ? 'Command' : 'Super') : null,
                e.altKey ? 'Alt' : null,
                e.shiftKey ? 'Shift' : null,
                e.code === 'Space' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key,
              ].filter(Boolean);
              setShortcut(keys.join('+'));
              setRecording(false);
            }}
          />
          <Button variant="outline" onClick={() => setRecording(!recording)}>
            {recording ? t('取消') : t('录制')}
          </Button>
          <Button onClick={() => void update({ shortcut })}>{t('保存')}</Button>
        </div>
      </div>
      {state.shortcutError && (
        <div className="settings-warning">
          {state.shortcutError}
          <Button variant="outline" onClick={() => void update({ shortcut: coexist })}>
            {t('使用')}
            {formatShortcut(coexist, state.platform)}
          </Button>
        </div>
      )}
      <div className="setting-row">
        <div>
          <strong>{t('失焦收起')}</strong>
        </div>
        <Switch
          aria-label={t('失焦收起')}
          checked={state.settings.hideOnBlur}
          onCheckedChange={(value) => void update({ hideOnBlur: value })}
        />
      </div>
      <div className="setting-row">
        <div>
          <strong>{t('开机自启动')}</strong>
          {state.startup.reason && <p>{state.startup.reason}</p>}
        </div>
        <Switch
          aria-label={t('开机自启动')}
          checked={state.startup.enabled}
          disabled={!state.startup.supported || startupBusy}
          onCheckedChange={async (value) => {
            setStartupBusy(true);
            try {
              const result = await api('startup', value);
              await refresh();
              toast(
                result.reason || (result.enabled ? t('已开启开机自启动') : t('已关闭开机自启动')),
              );
            } catch (e) {
              toast(errorText(e), true);
              await refresh();
            } finally {
              setStartupBusy(false);
            }
          }}
        />
      </div>
      <div className="setting-row">
        <div>
          <strong>{t('语言')}</strong>
        </div>
        <SettingsSelect
          label={t('语言')}
          value={state.settings.language}
          onValueChange={(language) => void update({ language })}
          items={[
            { value: 'system', label: t('跟随系统') },
            { value: 'zh-CN', label: '简体中文' },
            { value: 'zh-Hant', label: '繁體中文' },
            { value: 'en', label: 'English' },
          ]}
        />
      </div>
      <div className="settings-section-title">
        <Palette size={17} />
        {t('外观')}
      </div>
      <div className="setting-row">
        <div>
          <strong>{t('主题')}</strong>
        </div>
        <SettingsSelect
          label={t('主题')}
          value={state.settings.theme}
          onValueChange={(theme) => void update({ theme })}
          items={[
            { value: 'system', label: t('跟随系统') },
            { value: 'light', label: t('浅色') },
            { value: 'dark', label: t('深色') },
          ]}
        />
      </div>
      <div className="settings-section-title">
        <ClipboardList size={17} />
        {t('剪贴板')}
      </div>
      <div className="setting-row">
        <div>
          <strong>{t('记录剪贴板历史')}</strong>
        </div>
        <Switch
          aria-label={t('记录剪贴板历史')}
          checked={state.settings.clipboardEnabled}
          onCheckedChange={(value) => void update({ clipboardEnabled: value })}
        />
      </div>
      <div className="setting-row">
        <div>
          <strong>{t('保留条数')}</strong>
        </div>
        <SettingsSelect
          label={t('保留条数')}
          value={state.settings.maxClipboardItems}
          onValueChange={(maxClipboardItems) => void update({ maxClipboardItems })}
          items={[100, 500, 1000, 3000, 5000].map((value) => ({
            value,
            label: t('{{v0}} 条', { v0: value, count: value }),
          }))}
        />
      </div>
      <div className="setting-row">
        <div>
          <strong>{t('保留时间')}</strong>
        </div>
        <SettingsSelect
          label={t('保留天数')}
          value={state.settings.retentionDays}
          onValueChange={(retentionDays) => void update({ retentionDays })}
          items={[7, 30, 90, 365, 3650].map((value) => ({
            value,
            label: value === 3650 ? t('10 年') : t('{{v0}} 天', { v0: value, count: value }),
          }))}
        />
      </div>
      <div className="settings-section-title">
        <FolderSearch size={17} />
        {t('应用和快捷方式搜索')}
      </div>
      <div className="search-paths">
        {state.settings.searchPaths.map((folder) => (
          <div key={folder}>
            <FolderOpen size={16} />
            <span title={folder}>{folder}</span>
            <IconButton
              title={t('移除目录 ') + folder}
              onClick={() =>
                void update({ searchPaths: state.settings.searchPaths.filter((p) => p !== folder) })
              }
            >
              <X size={15} />
            </IconButton>
          </div>
        ))}
      </div>
      <div className="tool-buttons">
        <Button
          variant="outline"
          onClick={async () => {
            try {
              const folder = await api('pickSearchPath');
              if (folder && !state.settings.searchPaths.includes(folder))
                await update({ searchPaths: [...state.settings.searchPaths, folder] });
            } catch (e) {
              toast(errorText(e), true);
            }
          }}
        >
          <Plus size={16} />
          {t('添加搜索目录')}
        </Button>
        <Button
          variant="outline"
          disabled={state.catalogLoading}
          onClick={() =>
            void api('rescan')
              .then(() => toast(t('索引已刷新')))
              .catch((e) => toast(errorText(e), true))
          }
        >
          <RefreshCw size={16} />
          {state.catalogLoading ? t('正在索引…') : t('重新扫描')}
        </Button>
      </div>
      {(state.platform === 'win32' || mac || linux) && (
        <>
          <div className="settings-section-title">
            <FolderSearch size={17} />
            {linux ? t('Linux 文件搜索') : mac ? t('Spotlight 文件搜索') : t('Everything 文件索引')}
          </div>
          <div className="search-paths">
            {state.settings.fileSearchPaths.map((folder) => (
              <div key={folder}>
                <FolderOpen size={16} />
                <span title={folder}>{folder}</span>
                <IconButton
                  title={(mac || linux ? t('移除搜索目录 ') : t('移除索引目录 ')) + folder}
                  onClick={() =>
                    void update({
                      fileSearchPaths: state.settings.fileSearchPaths.filter((p) => p !== folder),
                    })
                  }
                >
                  <X size={15} />
                </IconButton>
              </div>
            ))}
          </div>
          <div className="tool-buttons">
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const folder = await api('pickSearchPath');
                  if (folder && !state.settings.fileSearchPaths.includes(folder))
                    await update({ fileSearchPaths: [...state.settings.fileSearchPaths, folder] });
                } catch (e) {
                  toast(errorText(e), true);
                }
              }}
            >
              <Plus size={16} />
              {mac || linux ? t('添加文件搜索目录') : t('添加索引目录')}
            </Button>
            {state.settings.fileSearchPaths.length > 0 ? (
              <Button variant="outline" onClick={() => void update({ fileSearchPaths: [] })}>
                {linux
                  ? t('清空搜索目录')
                  : mac
                    ? t('恢复 Spotlight 默认范围')
                    : t('恢复全部本地磁盘')}
              </Button>
            ) : (
              <span className="subtle">
                {linux
                  ? t('请添加要搜索的目录')
                  : mac
                    ? t('当前：Spotlight 默认范围')
                    : t('当前：全部本地固定磁盘')}
              </span>
            )}
          </div>
        </>
      )}
      {state.nativeStatus && <div className="settings-warning">{state.nativeStatus}</div>}
      <div className="settings-section-title">
        <Monitor size={17} />
        {t('关于与数据')}
      </div>
      <div className="setting-row">
        <div>
          <strong>Nexlet {state.version}</strong>
          <p>
            {state.platform === 'win32'
              ? 'Windows'
              : state.platform === 'darwin'
                ? 'macOS'
                : state.platform}
            {t('· 本地存储')}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void api('openData').catch((e) => toast(errorText(e), true))}
        >
          <FolderOpen size={16} />
          {t('打开数据目录')}
        </Button>
      </div>
      <PanelSettings />
      <CommandManager />
      <UpdatePanel />
    </div>
  );
}
