import { useEffect, useState } from 'react';
import { t } from '../shared/i18n';
import {
  SYNC_CATEGORIES,
  syncLabels,
  type AccountAction,
  type AccountState,
} from '../shared/account-sync';
import { api, errorText, useApp } from './common';

export function AccountSettingsPanel() {
  const [state, setState] = useState<AccountState | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const { dialog, toast } = useApp();
  useEffect(() => {
    let active = true;
    const refresh = () =>
      void api('accountSync', { action: 'state' })
        .then((value) => {
          if (active) setState(value);
        })
        .catch((e) => {
          if (active) setError(errorText(e));
        });
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  const run = async (input: AccountAction) => {
    setBusy(true);
    setError('');
    try {
      setState(await api('accountSync', input));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  if (!state) return <div className="settings-warning">{error}</div>;
  const bytes = (value: number) => (value / 1024 / 1024).toFixed(1) + ' MiB';
  return (
    <section className="config-profile account-settings">
      <div className="settings-section-title">{t('账号与同步')}</div>
      {!state.user ? (
        <button
          className="button"
          disabled={busy || !!state.login}
          onClick={() => void run({ action: 'login' })}
        >
          {t('使用 GitHub 登录')}
        </button>
      ) : (
        <div className="setting-row">
          <strong>{state.user.name}</strong>
          <div className="tool-buttons">
            <button
              className="button"
              disabled={busy || state.running}
              onClick={() => void run({ action: 'sync' })}
            >
              {state.running ? t('正在同步…') : t('立即同步')}
            </button>
            <button
              className="button"
              disabled={busy || !!state.login}
              onClick={() => void run({ action: 'login' })}
            >
              {t('重新登录')}
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() => void run({ action: 'logout' })}
            >
              {t('退出登录')}
            </button>
          </div>
        </div>
      )}
      {state.login && (
        <div className="settings-warning">
          <p>
            {t('在浏览器中确认设备代码')} <strong>{state.login.code}</strong>
          </p>
          <button className="button" onClick={() => void run({ action: 'cancel' })}>
            {t('取消登录')}
          </button>
        </div>
      )}
      {(error || state.error) && (
        <div className="settings-warning" role="alert">
          {error || state.error}
        </div>
      )}
      {state.user && (
        <>
          {!state.persistent && (
            <p className="settings-warning">{t('系统密钥存储不可用，本次登录仅保留在内存中。')}</p>
          )}
          <p className="subtle">
            {t(
              '选择同步内容。首次勾选会合并本机与云端数据，冲突由你选择；API Key 和账号凭据不上传。',
            )}
          </p>
          <div className="sync-categories">
            {SYNC_CATEGORIES.map((kind) => (
              <label key={kind}>
                <input
                  type="checkbox"
                  checked={state.enabled.includes(kind)}
                  disabled={busy || state.running}
                  onChange={(e) =>
                    void run({
                      action: 'categories',
                      enabled: e.target.checked
                        ? [...state.enabled, kind]
                        : state.enabled.filter((c) => c !== kind),
                    })
                  }
                />
                {t(syncLabels[kind])}
              </label>
            ))}
          </div>
          <p className="subtle">
            {bytes(state.used)} / {bytes(state.quota)}
            {state.pending > 0 ? ' · ' + t('待上传') + ' ' + state.pending : ''}
          </p>
          {state.conflicts.map((conflict) => (
            <details key={conflict.key}>
              <summary>
                {t('同步冲突')} · {t(syncLabels[conflict.local.kind])} · {conflict.local.id}
              </summary>
              <div className="sync-comparison">
                <div>
                  <strong>{t('本机')}</strong>
                  <pre>
                    {conflict.local.deleted
                      ? t('已删除')
                      : JSON.stringify(conflict.local.value, null, 2).slice(0, 5000)}
                  </pre>
                </div>
                <div>
                  <strong>{t('云端')}</strong>
                  <pre>
                    {conflict.remote.deleted
                      ? t('已删除')
                      : JSON.stringify(conflict.remote.value, null, 2).slice(0, 5000)}
                  </pre>
                </div>
              </div>
              <div className="tool-buttons">
                <button
                  className="button"
                  disabled={busy || state.running}
                  onClick={() =>
                    void run({ action: 'resolve', key: conflict.key, choice: 'local' })
                  }
                >
                  {t('保留本机')}
                </button>
                <button
                  className="button"
                  disabled={busy || state.running}
                  onClick={() =>
                    void run({ action: 'resolve', key: conflict.key, choice: 'remote' })
                  }
                >
                  {t('使用云端')}
                </button>
              </div>
            </details>
          ))}
          {!!state.mappings.length && (
            <details>
              <summary>
                {t('待确认的本机路径与快捷键')} · {state.mappings.length}
              </summary>
              {state.mappings.map((mapping) => (
                <DeviceMapping
                  key={mapping.id + mapping.path + mapping.shortcut}
                  mapping={mapping}
                  busy={busy}
                  save={run}
                />
              ))}
            </details>
          )}
          {!!state.pluginSuggestions.length && (
            <details>
              <summary>{t('云端插件清单')}</summary>
              {state.pluginSuggestions.map((plugin) => (
                <div className="setting-row" key={plugin.id}>
                  <span>
                    {plugin.id} · {plugin.version}
                  </span>
                  <button
                    className="button"
                    onClick={() =>
                      void api('marketTasks', { action: 'enqueue', pluginId: plugin.id })
                        .then(() => toast(t('已加入下载任务，请在插件市场确认安装')))
                        .catch((e) => toast(errorText(e), true))
                    }
                  >
                    {t('下载')}
                  </button>
                </div>
              ))}
            </details>
          )}
          <details>
            <summary onClick={() => void run({ action: 'devices' })}>{t('登录设备')}</summary>
            {state.devices.map((device) => (
              <div className="setting-row" key={device.id}>
                <div>
                  {device.current ? t('当前设备') : device.userAgent || t('其他设备')}
                  <p className="subtle">{new Date(device.createdAt).toLocaleString()}</p>
                </div>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => void run({ action: 'revoke', id: device.id })}
                >
                  {t('撤销登录')}
                </button>
              </div>
            ))}
          </details>
          <details>
            <summary>{t('删除云端账号')}</summary>
            <p className="subtle">{t('删除账号、全部会话和云端同步数据，保留本机内容。')}</p>
            <button
              className="button danger"
              disabled={busy}
              onClick={() =>
                void (async () => {
                  if (
                    await dialog({
                      title: t('删除云端账号？'),
                      message: t('此操作无法撤销，将移除所有设备的登录和云端数据。'),
                      confirm: t('删除账号'),
                      danger: true,
                    })
                  )
                    await run({ action: 'delete' });
                })()
              }
            >
              {t('删除账号')}
            </button>
          </details>
        </>
      )}
    </section>
  );
}
function DeviceMapping({
  mapping,
  busy,
  save,
}: {
  mapping: AccountState['mappings'][number];
  busy: boolean;
  save: (input: AccountAction) => Promise<void>;
}) {
  const [path, setPath] = useState(mapping.path ?? ''),
    [shortcut, setShortcut] = useState(mapping.shortcut ?? '');
  return (
    <div className="sync-mapping">
      <strong>{mapping.name || mapping.id}</strong>
      <span className="subtle">{mapping.platform}</span>
      {mapping.path !== undefined && (
        <label>
          {t('本机路径')}
          <input value={path} onChange={(e) => setPath(e.target.value)} />
        </label>
      )}
      <label>
        {t('本机快捷键')}
        <input value={shortcut} onChange={(e) => setShortcut(e.target.value)} />
      </label>
      <button
        className="button"
        disabled={busy}
        onClick={() => void save({ action: 'mapping', id: mapping.id, path, shortcut })}
      >
        {t('应用本机映射')}
      </button>
    </div>
  );
}
