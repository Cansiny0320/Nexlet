import { t } from '../shared/i18n';
import { useEffect, useState } from 'react';
import { api, errorText } from './common';
import { SettingsSelect } from './components/settings-select';
import type { CapabilitySettingsState } from '../shared/capability-providers';

export function CapabilitySettingsPanel() {
  const [state, setState] = useState<CapabilitySettingsState>({
    providers: [],
    defaults: {},
    configurations: {},
  });
  const [error, setError] = useState('');
  useEffect(() => {
    void api('capabilitySettings', { action: 'read' })
      .then(setState)
      .catch((e) => setError(errorText(e)));
  }, []);
  return (
    <section>
      <div className="settings-section-title">{t('OCR 与翻译')}</div>
      {(['ocr', 'translation'] as const).map((capability) => {
        const providers = state.providers.filter((p) => p.capability === capability);
        const missing =
          !!state.defaults[capability] &&
          !providers.some((p) => p.id === state.defaults[capability]);
        return (
          <div className="setting-row" key={capability}>
            <div>
              <strong>{capability === 'ocr' ? t('OCR 提供商') : t('翻译提供商')}</strong>
              {(!providers.length || missing) && (
                <p className="settings-warning">
                  {missing
                    ? t('已选择的提供商不可用，请启用对应插件或重新选择。')
                    : t('请先从插件市场安装对应插件。')}
                </p>
              )}
            </div>
            <SettingsSelect
              label={capability === 'ocr' ? t('OCR 提供商') : t('翻译提供商')}
              value={missing ? '' : (state.defaults[capability] ?? '')}
              items={[
                { value: '', label: t('未选择') },
                ...providers.map((p) => ({
                  value: p.id,
                  label: p.name + (p.locality === 'cloud' ? t('（云端）') : t('（本地）')),
                })),
              ]}
              onValueChange={(id) => {
                setError('');
                void api('capabilitySettings', { action: 'default', capability, id: id || null })
                  .then(setState)
                  .catch((e) => setError(errorText(e)));
              }}
            />
          </div>
        );
      })}
      {state.providers
        .filter((p) => p.configSchema)
        .map((provider) => (
          <ProviderConfiguration
            key={provider.id}
            name={provider.name}
            value={state.configurations[provider.id] ?? {}}
            save={async (value) => {
              setState(
                await api('capabilitySettings', { action: 'configure', id: provider.id, value }),
              );
            }}
          />
        ))}
      {error && (
        <p role="alert" className="settings-warning">
          {error}
        </p>
      )}
    </section>
  );
}
function ProviderConfiguration({
  name,
  value,
  save,
}: {
  name: string;
  value: Record<string, unknown>;
  save: (value: Record<string, unknown>) => Promise<void>;
}) {
  const [text, setText] = useState(JSON.stringify(value, null, 2)),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <details>
      <summary>
        {name} · {t('配置')}
      </summary>
      <textarea aria-label={name} rows={4} value={text} onChange={(e) => setText(e.target.value)} />
      <button
        className="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError('');
          void Promise.resolve()
            .then(() => save(JSON.parse(text)))
            .catch((e) => setError(errorText(e)))
            .finally(() => setBusy(false));
        }}
      >
        {t('保存')}
      </button>
      {error && <p className="settings-warning">{error}</p>}
    </details>
  );
}
