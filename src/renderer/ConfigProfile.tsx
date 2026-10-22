import { useState } from 'react';
import { api, useApp, errorText } from './common';
import { t } from '../shared/i18n';
import { profileLabels, type ProfileCategory, type ProfilePreview } from '../shared/config-profile';
export function ConfigProfilePanel() {
  const { toast, dialog } = useApp();
  const [text, setText] = useState(''),
    [preview, setPreview] = useState<ProfilePreview | null>(null),
    [selected, setSelected] = useState<ProfileCategory[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="config-profile">
      <div className="settings-section-title">{t('配置导入导出')}</div>
      <p className="subtle">
        {t('配置文件可手动编辑，不包含 API Key、剪贴板历史、图片或工具草稿。')}
      </p>
      <div className="tool-buttons">
        <button
          className="button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              if (await api('configProfile', { action: 'export' })) toast(t('配置已导出'));
            })
          }
        >
          {t('导出配置')}
        </button>
        <button
          className="button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const value = await api('configProfile', { action: 'open' });
              if (typeof value === 'string') {
                setText(value);
                setPreview(null);
              }
            })
          }
        >
          {t('打开配置文件')}
        </button>
        <button
          className="button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              if (
                await dialog({
                  title: t('撤销上次配置导入？'),
                  message: t('恢复导入前的配置，不影响历史和草稿。'),
                  confirm: t('撤销'),
                })
              ) {
                await api('configProfile', { action: 'undo' });
                setPreview(null);
                toast(t('已撤销配置导入'));
              }
            })
          }
        >
          {t('撤销上次导入')}
        </button>
      </div>
      <details>
        <summary>{t('编辑并预览导入')}</summary>
        <textarea
          className="profile-editor"
          aria-label={t('JSONC 配置')}
          value={text}
          spellCheck={false}
          onChange={(event) => {
            setText(event.target.value);
            setPreview(null);
          }}
        />
        <button
          className="button"
          disabled={busy || !text.trim()}
          onClick={() =>
            void run(async () => {
              const value = (await api('configProfile', {
                action: 'preview',
                text,
              })) as ProfilePreview;
              setPreview(value);
              setSelected(
                value.changes
                  .filter((item) => item.category !== 'plugins')
                  .map((item) => item.category),
              );
            })
          }
        >
          {t('预览差异')}
        </button>
      </details>
      {error && (
        <p className="settings-warning" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <div>
          {preview.warnings.map((value) => (
            <p className="settings-warning" key={value}>
              {value}
            </p>
          ))}
          {!preview.changes.length && <p>{t('配置没有变化')}</p>}
          {preview.changes.map((change) => (
            <details key={change.category} className="profile-diff">
              <summary>
                <label>
                  <input
                    type="checkbox"
                    disabled={change.category === 'plugins' || busy}
                    checked={selected.includes(change.category)}
                    onChange={(event) =>
                      setSelected((old) =>
                        event.target.checked
                          ? [...old, change.category]
                          : old.filter((key) => key !== change.category),
                      )
                    }
                  />
                  {t(profileLabels[change.category])}
                </label>
              </summary>
              <div className="profile-columns">
                <div>
                  <strong>{t('当前配置')}</strong>
                  <pre>{change.before}</pre>
                </div>
                <div>
                  <strong>{t('导入配置')}</strong>
                  <pre>{change.after}</pre>
                </div>
              </div>
            </details>
          ))}
          <button
            className="button primary"
            disabled={busy || !selected.length}
            onClick={() =>
              void run(async () => {
                await api('configProfile', {
                  action: 'apply',
                  token: preview.token,
                  categories: selected,
                });
                setPreview(null);
                toast(t('配置已导入'));
              })
            }
          >
            {t('应用选中类别')}
          </button>
        </div>
      )}
    </section>
  );
}
