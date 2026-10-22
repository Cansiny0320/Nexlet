import { t } from '../shared/i18n';
import { Textarea } from './components/ui/textarea';
import { Input } from './components/ui/input';
import { ShortcutInput } from './components/shortcut-input';
import { formatShortcut } from '../shared/shortcut-display';
import { recordedShortcutKey } from '../shared/shortcut-recording';
import { Button } from './components/ui/button';
import { Switch } from './components/ui/switch';
import { useEffect, useState } from 'react';
import { Plus, FolderOpen, Trash2, SlidersHorizontal } from 'lucide-react';
import type { Command } from '../shared/types';
import type { LocalEntry } from '../shared/command-config';
import { api, useApp, errorText, ToolIcon } from './common';
import { SettingsIconButton as IconButton } from './components/settings-icon-button';

export function CommandEditor({ command, onClose }: { command: Command; onClose: () => void }) {
  const { state, toast } = useApp(),
    pref = state.commandConfig.commands[command.id];
  const [aliases, setAliases] = useState((pref?.aliases || []).join('\n')),
    [shortcut, setShortcut] = useState(pref?.shortcut || ''),
    [captureSelection, setCaptureSelection] = useState(pref?.captureSelection || false),
    [disabled, setDisabled] = useState(pref?.disabled || false),
    [recording, setRecording] = useState(false),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    void api('window', { action: 'busy', value: true });
    return () => {
      void api('window', { action: 'busy', value: false });
    };
  }, []);
  const status = state.shortcutStatuses[command.id];
  const save = async () => {
    setSaving(true);
    try {
      await api('commandConfig', {
        action: 'patch',
        id: command.id,
        patch: {
          aliases: aliases
            .split(/[\n,，]/)
            .map((v) => v.trim())
            .filter(Boolean),
          shortcut,
          disabled,
          captureSelection,
        },
      });
      toast(t('功能设置已保存'));
      onClose();
    } catch (e) {
      toast(errorText(e), true);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <form
        className="modal command-editor"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape' && !recording) onClose();
        }}
      >
        <h2>
          {command.name}
          {t('· 功能设置')}
        </h2>
        <label>
          {t('功能别名')}
          <Textarea
            aria-label={t('功能别名')}
            value={aliases}
            placeholder={t('每行一个别名，也可用逗号分隔')}
            onChange={(e) => setAliases(e.target.value)}
          />
        </label>
        <label>
          {t('功能快捷键')}
          <ShortcutInput
            platform={state.platform}
            aria-label={t('功能快捷键')}
            value={recording ? t('按下组合键…') : shortcut}
            readOnly={recording}
            placeholder={t('例如 Control+Alt+J').replace(
              'Control+Alt+J',
              formatShortcut('Control+Alt+J', state.platform),
            )}
            onValueChange={setShortcut}
            onKeyDown={(e) => {
              if (!recording) return;
              e.preventDefault();
              if (
                e.nativeEvent.isComposing ||
                e.repeat ||
                ['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)
              )
                return;
              if (e.key === 'Escape') {
                setRecording(false);
                return;
              }
              setShortcut(
                [
                  e.metaKey ? (state.platform === 'darwin' ? 'Command' : 'Super') : null,
                  e.ctrlKey ? 'Control' : null,
                  e.altKey ? 'Alt' : null,
                  e.shiftKey ? 'Shift' : null,
                  recordedShortcutKey(e, state.platform),
                ]
                  .filter(Boolean)
                  .join('+'),
              );
              setRecording(false);
            }}
          />
        </label>
        <div className="tool-buttons">
          <Button type="button" variant="outline" onClick={() => setRecording(!recording)}>
            {recording ? t('取消录制') : t('录制快捷键')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setShortcut('');
              setRecording(false);
            }}
          >
            {t('清除快捷键')}
          </Button>
        </div>
        {status?.desired && (
          <p>
            {t('已保存：')}
            {formatShortcut(status.desired, state.platform)} ·{' '}
            {status.effective
              ? t('已生效：{{v0}}', { v0: formatShortcut(status.effective, state.platform) })
              : status.inactive || status.error || t('未生效')}
          </p>
        )}
        <label className="command-disabled">
          <Switch
            aria-label={t('快捷键启动时带入选中内容')}
            checked={captureSelection}
            onCheckedChange={setCaptureSelection}
          />
          {t('快捷键启动时带入选中内容')}
        </label>
        <label className="command-disabled">
          <Switch aria-label={t('禁用此功能')} checked={disabled} onCheckedChange={setDisabled} />
          {t('禁用此功能')}
        </label>
        <div className="modal-actions">
          <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>
            {t('取消')}
          </Button>
          <Button type="submit" disabled={saving}>
            {t('保存功能设置')}
          </Button>
        </div>
      </form>
    </div>
  );
}

export function CommandManager() {
  const { state, toast, dialog } = useApp();
  const [query, setQuery] = useState(''),
    [editing, setEditing] = useState<Command | null>(null),
    [local, setLocal] = useState<Partial<LocalEntry> | null>(null);
  const catalog = state.commandCatalog,
    known = new Set(catalog.map((c) => c.id));
  const unavailable: Command[] = Object.keys(state.commandConfig.commands)
    .filter((id) => !known.has(id))
    .map((id) => ({
      id,
      name: id,
      subtitle: t('功能暂不可用，配置已保留'),
      kind: 'tool',
      keywords: state.commandConfig.commands[id].aliases || [],
    }));
  const list = [...catalog, ...unavailable],
    words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = words.length
    ? list.filter((c) =>
        words.every((word) =>
          [c.name, c.subtitle, ...c.keywords].some((value) => value.toLowerCase().includes(word)),
        ),
      )
    : list;
  const saveLocal = async () => {
    try {
      await api('commandConfig', {
        action: 'localSave',
        id: local?.id,
        name: local?.name ?? '',
        path: local?.path ?? '',
      });
      setLocal(null);
      toast(t('本地启动项已保存'));
    } catch (e) {
      toast(errorText(e), true);
    }
  };
  return (
    <>
      <div className="settings-section-title">
        <SlidersHorizontal size={17} />
        {t('功能管理')}
      </div>
      <Input
        className="command-filter"
        aria-label={t('筛选功能')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('搜索功能名称或别名')}
      />
      <div className="command-management-list">
        {filtered.slice(0, 200).map((command) => {
          const pref = state.commandConfig.commands[command.id],
            status = state.shortcutStatuses[command.id];
          return (
            <button
              className="command-management-row"
              key={command.id}
              onClick={() => setEditing(command)}
            >
              <ToolIcon command={command} size={26} />
              <span>
                <strong>{command.name}</strong>
                <small>{pref?.aliases?.join(' · ') || command.subtitle}</small>
              </span>
              {(!known.has(command.id) || pref?.disabled || status?.desired) && (
                <span className="command-state">
                  {!known.has(command.id) ? t('不可用') : pref?.disabled ? t('已禁用') : null}
                  {status?.desired && (
                    <small>
                      {status.effective
                        ? formatShortcut(status.effective, state.platform)
                        : status.inactive || status.error || t('未生效')}
                    </small>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {filtered.length > 200 && (
        <p className="setting-description">
          {t('显示前 200 项，共 {{v0}} 项；输入名称可继续筛选。', { v0: filtered.length })}
        </p>
      )}
      <div className="settings-section-title">
        <FolderOpen size={17} />
        {t('本地启动项')}
      </div>
      <div className="simple-list">
        {state.commandConfig.localEntries.map((entry) => (
          <div className="web-item" key={entry.id}>
            <FolderOpen size={22} />
            <button className="web-link" onClick={() => setLocal(entry)}>
              <strong>{entry.name}</strong>
              <span>{entry.path}</span>
            </button>
            <IconButton
              title={t('删除本地项 ') + entry.name}
              onClick={async () => {
                if (
                  await dialog({
                    title: t('删除本地启动项？'),
                    message: entry.name,
                    confirm: t('删除'),
                    danger: true,
                  })
                )
                  void api('commandConfig', { action: 'localRemove', id: entry.id }).catch((e) =>
                    toast(errorText(e), true),
                  );
              }}
            >
              <Trash2 size={16} />
            </IconButton>
          </div>
        ))}
      </div>
      {local ? (
        <form
          className="local-entry-form"
          onSubmit={(e) => {
            e.preventDefault();
            void saveLocal();
          }}
        >
          <Input
            aria-label={t('本地项名称')}
            maxLength={60}
            value={local.name || ''}
            placeholder={t('名称')}
            onChange={(e) => setLocal({ ...local, name: e.target.value })}
          />
          <Input
            aria-label={t('本地项路径')}
            value={local.path || ''}
            placeholder={t('文件或目录的绝对路径')}
            onChange={(e) => setLocal({ ...local, path: e.target.value })}
          />
          <div className="tool-buttons">
            {[false, true].map((directory) => (
              <Button
                type="button"
                variant="outline"
                key={String(directory)}
                onClick={async () => {
                  try {
                    const target = await api('localPick', { directory });
                    if (target)
                      setLocal({
                        ...local,
                        path: target,
                        name: local.name || target.split(/[\\/]/).pop(),
                      });
                  } catch (e) {
                    toast(errorText(e), true);
                  }
                }}
              >
                {directory ? t('选择目录') : t('选择文件')}
              </Button>
            ))}
            <Button type="submit">{t('保存本地项')}</Button>
            <Button type="button" variant="ghost" onClick={() => setLocal(null)}>
              {t('取消')}
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" onClick={() => setLocal({})}>
          <Plus size={16} />
          {t('添加本地启动项')}
        </Button>
      )}
      {editing && (
        <CommandEditor key={editing.id} command={editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}
