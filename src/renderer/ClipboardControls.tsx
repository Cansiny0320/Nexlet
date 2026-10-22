import { useEffect, useState } from 'react';
import { Switch } from './components/ui/switch';
import { t } from '../shared/i18n';
import { api, useApp, errorText } from './common';
const localDate = (time: number) => {
  const date = new Date(time);
  return new Date(time - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
export function ClipboardControls() {
  const { state, toast, dialog } = useApp();
  const [apps, setApps] = useState(state.settings.clipboardExcludedApps.join('\n')),
    [error, setError] = useState('');
  const [start, setStart] = useState(localDate(Date.now() - 7 * 86400000)),
    [end, setEnd] = useState(localDate(Date.now())),
    [favorites, setFavorites] = useState(false);
  const [now, setNow] = useState(Date.now()),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setApps(state.settings.clipboardExcludedApps.join('\n'));
  }, [state.settings.clipboardExcludedApps.join('\n')]);
  useEffect(() => {
    const remaining = state.settings.clipboardPausedUntil - Date.now();
    if (remaining > 0) {
      const timer = setTimeout(() => setNow(Date.now()), remaining + 1);
      return () => clearTimeout(timer);
    }
  }, [state.settings.clipboardPausedUntil]);
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
      setNow(Date.now());
    }
  };
  const paused = state.settings.clipboardPausedUntil > now;
  return (
    <section>
      <div className="setting-row">
        <div>
          <strong>{t('定时暂停记录')}</strong>
          {paused && (
            <p>
              {t('暂停至 {{v0}}', {
                v0: new Date(state.settings.clipboardPausedUntil).toLocaleTimeString(),
              })}
            </p>
          )}
        </div>
        <button
          className="button"
          disabled={busy}
          onClick={() =>
            void run(() =>
              api('settings', { clipboardPausedUntil: paused ? 0 : Date.now() + 15 * 60000 }),
            )
          }
        >
          {paused ? t('恢复记录') : t('暂停 15 分钟')}
        </button>
      </div>
      <div className="setting-row">
        <div>
          <strong>{t('收藏图片后自动识别文字')}</strong>
          <p>{t('使用已安装的离线 OCR 插件，仅在本机建立搜索索引。')}</p>
        </div>
        <Switch
          aria-label={t('收藏图片后自动识别文字')}
          checked={state.settings.clipboardOcrFavorites}
          onCheckedChange={(value) =>
            void run(() => api('settings', { clipboardOcrFavorites: value }))
          }
        />
      </div>
      <details>
        <summary>{t('按应用暂停记录')}</summary>
        <p className="subtle">
          {t(
            '每行一个应用名称、bundle ID 或程序路径。仅在能识别前台应用时匹配；Wayland 无法识别前台应用。',
          )}
        </p>
        <textarea
          className="profile-editor"
          aria-label={t('不记录的应用')}
          value={apps}
          onChange={(event) => setApps(event.target.value)}
        />
        <button
          className="button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await api('settings', {
                clipboardExcludedApps: apps
                  .split('\n')
                  .map((value) => value.trim())
                  .filter(Boolean),
              });
              toast(t('设置已保存'));
            })
          }
        >
          {t('保存应用列表')}
        </button>
      </details>
      <details>
        <summary>{t('按时间范围清理')}</summary>
        <p className="subtle">{t('按最近复制或使用时间筛选，开始时间包含，结束时间不包含。')}</p>
        <div className="tool-buttons">
          <label>
            {t('开始时间')}
            <input
              type="datetime-local"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </label>
          <label>
            {t('结束时间')}
            <input
              type="datetime-local"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </label>
        </div>
        <label>
          <input
            type="checkbox"
            checked={favorites}
            onChange={(event) => setFavorites(event.target.checked)}
          />
          {t('同时删除收藏')}
        </label>
        <button
          className="button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const range = {
                start: new Date(start).getTime(),
                end: new Date(end).getTime(),
                includeFavorites: favorites,
              };
              const preview = await api('clipCleanup', { action: 'preview', ...range });
              if (!preview.count) {
                toast(t('此范围没有可清理记录'));
                return;
              }
              if (
                await dialog({
                  title: t('清理 {{v0}} 条记录？', { v0: preview.count }),
                  message:
                    start +
                    ' → ' +
                    end +
                    '\n' +
                    (favorites ? t('包含收藏内容。') : t('收藏内容会保留。')),
                  confirm: t('清理'),
                  danger: true,
                })
              ) {
                await api('clipCleanup', { action: 'apply', ...range, revision: preview.revision });
                toast(t('记录已清理'));
              }
            })
          }
        >
          {t('预览清理范围')}
        </button>
      </details>
      {error && (
        <p className="settings-warning" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
