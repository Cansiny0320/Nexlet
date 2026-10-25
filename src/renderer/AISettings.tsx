import { t } from '../shared/i18n';
import { useEffect, useState } from 'react';
import { api, errorText } from './common';
import { Button } from './components/ui/button';
import { SettingsSelect } from './components/settings-select';
import { Switch } from './components/ui/switch';
import type { AIProvider, AISettingsAction, AISettingsState } from '../shared/ai';

const empty = (): AIProvider => ({
  id: crypto.randomUUID(),
  name: '',
  baseUrl: 'https://api.openai.com/v1',
  protocol: 'chat-completions',
  models: [],
  capabilities: { images: false, tools: false },
  maxOutputTokens: 4096,
});
export function AISettingsPanel() {
  const [state, setState] = useState<AISettingsState>({
    providers: [],
    defaultModel: null,
    credentials: {},
  });
  const [editing, setEditing] = useState<AIProvider | null>(null),
    [key, setKey] = useState(''),
    [models, setModels] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [result, setResult] = useState('');
  useEffect(() => {
    void api('aiSettings', { action: 'read' })
      .then(setState)
      .catch((e) => setError(errorText(e)));
  }, []);
  const run = async (action: AISettingsAction) => {
    setBusy(true);
    setError('');
    setResult('');
    try {
      const next = await api('aiSettings', action);
      setState(next);
      if (next.testResult) setResult(next.testResult);
      return next;
    } catch (e) {
      setError(errorText(e));
      return null;
    } finally {
      setBusy(false);
    }
  };
  const edit = (provider: AIProvider) => {
    setEditing(provider);
    setModels(provider.models.join('\n'));
    setKey('');
    setError('');
    setResult('');
  };
  const patch = (value: Partial<AIProvider>) =>
    setEditing((old) => (old ? { ...old, ...value } : old));
  return (
    <section className="ai-settings">
      <div className="settings-section-title">{t('AI 模型')}</div>
      <div className="setting-row">
        <strong>{t('默认模型')}</strong>
        <SettingsSelect
          label={t('默认模型')}
          value={
            state.defaultModel ? state.defaultModel.providerId + ':' + state.defaultModel.model : ''
          }
          items={[
            { value: '', label: t('未选择') },
            ...state.providers.flatMap((p) =>
              p.models.map((model) => ({
                value: p.id + ':' + model,
                label: p.name + ' / ' + model,
              })),
            ),
          ]}
          onValueChange={(value) => {
            const split = value.indexOf(':');
            void run({
              action: 'default',
              value:
                split < 0
                  ? null
                  : { providerId: value.slice(0, split), model: value.slice(split + 1) },
            });
          }}
        />
      </div>
      {state.providers.map((provider) => (
        <div className="setting-row" key={provider.id}>
          <div>
            <strong>{provider.name}</strong>
            <p>{provider.models.join(' · ') || t('尚未添加模型')}</p>
            {state.credentials[provider.id]?.persistent === false && (
              <p className="settings-warning">
                {t('系统密钥存储不可用，API Key 仅供本次运行使用。')}
              </p>
            )}
          </div>
          <Button variant="outline" disabled={busy} onClick={() => edit(provider)}>
            {t('编辑')}
          </Button>
        </div>
      ))}
      {!editing && (
        <Button variant="outline" onClick={() => edit(empty())}>
          {t('添加供应商')}
        </Button>
      )}
      {state.legacyAvailable && !editing && (
        <details>
          <summary>{t('迁移旧版 AI 动作模型')}</summary>
          <p className="subtle">
            {t('导入模型和服务地址，不复制 API Key。原有动作和私有配置仍然保留。')}
          </p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void run({ action: 'importLegacy' })}
          >
            {t('导入模型配置')}
          </Button>
        </details>
      )}
      {editing && (
        <form
          className="ai-provider-editor"
          onSubmit={(e) => {
            e.preventDefault();
            void run({
              action: 'save',
              provider: {
                ...editing,
                models: models
                  .split(/[\n,]/)
                  .map((m) => m.trim())
                  .filter(Boolean),
              },
              ...(key ? { apiKey: key } : {}),
            }).then((next) => {
              if (next) {
                setEditing(null);
                setKey('');
              }
            });
          }}
        >
          <label>
            {t('名称')}
            <input
              required
              maxLength={100}
              value={editing.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </label>
          <label>
            {t('服务地址')}
            <input
              required
              type="url"
              value={editing.baseUrl}
              onChange={(e) => patch({ baseUrl: e.target.value })}
            />
          </label>
          <div className="setting-row">
            <strong>{t('协议')}</strong>
            <SettingsSelect
              label={t('AI 协议')}
              value={editing.protocol}
              items={[
                { value: 'chat-completions', label: 'Chat Completions' },
                { value: 'responses', label: 'Responses' },
                { value: 'anthropic', label: 'Anthropic Messages' },
              ]}
              onValueChange={(protocol) =>
                patch({ protocol, reasoningEffort: undefined, thinkingBudgetTokens: undefined })
              }
            />
          </div>
          <label>
            API Key
            <input
              type="password"
              autoComplete="off"
              value={key}
              placeholder={
                state.credentials[editing.id]?.configured
                  ? t('已保存；留空保留')
                  : t('可选（本地模型可留空）')
              }
              onChange={(e) => setKey(e.target.value)}
            />
          </label>
          <label>
            {t('模型 ID（每行一个）')}
            <textarea rows={3} value={models} onChange={(e) => setModels(e.target.value)} />
          </label>
          <details>
            <summary>{t('模型能力与生成参数')}</summary>
            <div className="setting-row">
              <strong>{t('图片输入')}</strong>
              <Switch
                checked={editing.capabilities.images}
                onCheckedChange={(images) =>
                  patch({ capabilities: { ...editing.capabilities, images } })
                }
              />
            </div>
            <div className="setting-row">
              <strong>{t('工具调用')}</strong>
              <Switch
                checked={editing.capabilities.tools}
                onCheckedChange={(tools) =>
                  patch({ capabilities: { ...editing.capabilities, tools } })
                }
              />
            </div>
            <label>
              {t('输出 Token 上限')}
              <input
                type="number"
                min={1}
                max={200000}
                value={editing.maxOutputTokens}
                onChange={(e) => patch({ maxOutputTokens: Number(e.target.value) })}
              />
            </label>
            <label>
              {t('Temperature（留空使用服务默认值）')}
              <input
                type="number"
                min={0}
                max={editing.protocol === 'anthropic' ? 1 : 2}
                step={0.1}
                value={editing.temperature ?? ''}
                onChange={(e) =>
                  patch({ temperature: e.target.value === '' ? undefined : Number(e.target.value) })
                }
              />
            </label>
            <label>
              {t('上下文 Token 上限（可选）')}
              <input
                type="number"
                min={editing.maxOutputTokens + 1}
                max={10000000}
                value={editing.contextWindowTokens ?? ''}
                onChange={(e) =>
                  patch({
                    contextWindowTokens: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
              />
            </label>
            {editing.contextWindowTokens !== undefined && (
              <p className="subtle">
                {t('本地按文本字节保守估算；图片 Token 和实际限制由服务端校验。')}
              </p>
            )}
            {editing.protocol === 'anthropic' ? (
              <label>
                {t('思考预算 Token（仅适用于支持手动预算的模型）')}
                <input
                  type="number"
                  min={1024}
                  max={editing.maxOutputTokens - 1}
                  value={editing.thinkingBudgetTokens ?? ''}
                  onChange={(e) =>
                    patch({
                      thinkingBudgetTokens:
                        e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
                />
              </label>
            ) : (
              <div className="setting-row">
                <strong>{t('推理强度')}</strong>
                <SettingsSelect
                  label={t('推理强度')}
                  value={editing.reasoningEffort ?? ''}
                  items={[
                    { value: '', label: t('服务默认值') },
                    { value: 'low', label: 'low' },
                    { value: 'medium', label: 'medium' },
                    { value: 'high', label: 'high' },
                  ]}
                  onValueChange={(value) => patch({ reasoningEffort: value || undefined })}
                />
              </div>
            )}
            {(editing.reasoningEffort || editing.thinkingBudgetTokens) && (
              <p className="subtle">
                {t('启用推理参数时不发送 Temperature。模型不支持时会显示服务错误。')}
              </p>
            )}
          </details>
          <div className="tool-buttons">
            <Button type="submit" disabled={busy}>
              {t('保存')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setEditing(null);
                setKey('');
              }}
            >
              {t('取消')}
            </Button>
            {state.providers.some((p) => p.id === editing.id) && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run({ action: 'models', id: editing.id }).then((next) => {
                      if (next?.availableModels)
                        setModels(
                          [
                            ...new Set([
                              ...models.split('\n').filter(Boolean),
                              ...next.availableModels,
                            ]),
                          ].join('\n'),
                        );
                    })
                  }
                >
                  {t('获取模型')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || !editing.models.length}
                  onClick={() =>
                    void run({ action: 'test', id: editing.id, model: editing.models[0] })
                  }
                >
                  {t('测试已保存配置')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run({ action: 'save', provider: editing, apiKey: null }).then((next) => {
                      if (next) setKey('');
                    })
                  }
                >
                  {t('清除 API Key')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run({ action: 'remove', id: editing.id }).then((next) => {
                      if (next) {
                        setEditing(null);
                        setKey('');
                      }
                    })
                  }
                >
                  {t('删除供应商')}
                </Button>
              </>
            )}
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="settings-warning">
          {error}
        </p>
      )}
      {result && <p role="status">{result}</p>}
    </section>
  );
}
