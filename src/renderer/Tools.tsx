import { formatLocale, t } from '../shared/i18n';
import type { WebShortcut } from '../shared/types';
import { validateWebShortcut } from '../shared/web-shortcuts';
import { useToolState } from './tool-session';
import { ResultActions } from './ActionMenu';
import { useState, useEffect } from 'react';
import { Copy, RefreshCw, Plus, Trash2, Globe, Pencil } from 'lucide-react';
import { api, useApp, errorText, PanelHeader, Empty, IconButton } from './common';

function encode64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
function decode64(value: string) {
  const binary = atob(value.replace(/\s/g, ''));
  return new TextDecoder('utf-8', { fatal: true }).decode(
    Uint8Array.from(binary, (c) => c.charCodeAt(0)),
  );
}
export function ToolsPanel({ tool, initial }: { tool: string; initial: string }) {
  const { toast } = useApp();
  const [input, setInput] = useToolState('input', initial),
    [output, setOutput] = useToolState('output', ''),
    [error, setError] = useToolState('error', ''),
    [mode, setMode] = useToolState('mode', 'base64'),
    [count, setCount] = useToolState('count', 1);
  const [timestamp, setTimestamp] = useToolState(
      'timestamp',
      /^\d{10}(?:\d{3})?$/.test(initial.trim())
        ? initial.trim()
        : String(Math.floor(Date.now() / 1000)),
    ),
    [unit, setUnit] = useToolState(
      'unit',
      /^\d{13}$/.test(initial.trim()) ? 'milliseconds' : 'seconds',
    ),
    [date, setDate] = useToolState('date', localDateInput(new Date()));
  const copy = async (text = output) => {
    try {
      await api('clipAction', { action: 'writeText', text });
      toast(t('已复制'));
    } catch (e) {
      toast(errorText(e), true);
    }
  };
  function process(action: string) {
    try {
      setError('');
      if (input.length > 500000) throw new Error(t('文本过长，最多处理 50 万字符'));
      if (tool === 'encoding')
        setOutput(
          mode === 'base64'
            ? action === 'encode'
              ? encode64(input)
              : decode64(input)
            : action === 'encode'
              ? encodeURIComponent(input)
              : decodeURIComponent(input),
        );
    } catch (e) {
      setError(errorText(e));
      setOutput('');
    }
  }
  useEffect(() => {
    if (tool === 'uuid' && !output) setOutput(crypto.randomUUID());
  }, []);
  if (tool === 'timestamp') {
    const millis = Number(timestamp) * (unit === 'seconds' ? 1000 : 1),
      parsed = new Date(millis),
      valid = timestamp.trim() !== '' && Number.isFinite(millis) && !Number.isNaN(parsed.getTime());
    const fromDate = new Date(date),
      dateValid = !Number.isNaN(fromDate.getTime());
    return (
      <div className="standard-panel scroll-panel">
        <PanelHeader
          title={t('时间戳')}
          description={t('本地时区：{{v0}}', {
            v0: Intl.DateTimeFormat().resolvedOptions().timeZone,
          })}
        />
        <div className="field-label">{t('Unix 时间戳 → 日期')}</div>
        <ResultActions result={{ type: 'text', text: valid ? parsed.toISOString() : '' }} />
        <div className="form-row">
          <input
            aria-label={t('Unix 时间戳')}
            value={timestamp}
            onChange={(e) => setTimestamp(e.target.value)}
            inputMode="numeric"
          />
          <select
            aria-label={t('时间戳单位')}
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          >
            <option value="seconds">{t('秒')}</option>
            <option value="milliseconds">{t('毫秒')}</option>
          </select>
          <button
            className="button"
            onClick={() =>
              setTimestamp(String(unit === 'seconds' ? Math.floor(Date.now() / 1000) : Date.now()))
            }
          >
            {t('现在')}
          </button>
        </div>
        <div className="conversion-result">
          <label>{t('本地时间')}</label>
          <output>
            {valid
              ? parsed.toLocaleString(formatLocale(), { hour12: false })
              : t('请输入有效时间戳')}
          </output>
          {valid && (
            <IconButton
              title={t('复制本地时间')}
              onClick={() => void copy(parsed.toLocaleString(formatLocale(), { hour12: false }))}
            >
              <Copy size={16} />
            </IconButton>
          )}
        </div>
        <div className="conversion-result">
          <label>UTC</label>
          <output>{valid ? parsed.toISOString() : '—'}</output>
          {valid && (
            <IconButton title={t('复制 UTC 时间')} onClick={() => void copy(parsed.toISOString())}>
              <Copy size={16} />
            </IconButton>
          )}
        </div>
        <div className="field-label separated">{t('日期 → Unix 时间戳')}</div>
        <input
          className="date-input"
          type="datetime-local"
          step="1"
          aria-label={t('本地日期时间')}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <div className="conversion-result">
          <label>{t('秒')}</label>
          <output>{dateValid ? Math.floor(fromDate.getTime() / 1000) : '—'}</output>
          {dateValid && (
            <IconButton
              title={t('复制秒时间戳')}
              onClick={() => void copy(String(Math.floor(fromDate.getTime() / 1000)))}
            >
              <Copy size={16} />
            </IconButton>
          )}
        </div>
        <div className="conversion-result">
          <label>{t('毫秒')}</label>
          <output>{dateValid ? fromDate.getTime() : '—'}</output>
          {dateValid && (
            <IconButton
              title={t('复制毫秒时间戳')}
              onClick={() => void copy(String(fromDate.getTime()))}
            >
              <Copy size={16} />
            </IconButton>
          )}
        </div>
      </div>
    );
  }
  if (tool === 'uuid')
    return (
      <div className="standard-panel editor-tool">
        <PanelHeader title="UUID v4" />
        <div className="form-row">
          <label htmlFor="uuid-count">{t('数量')}</label>
          <input
            id="uuid-count"
            className="number-input"
            type="number"
            min="1"
            max="100"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
          <button
            className="button primary"
            onClick={() => {
              if (!Number.isInteger(count) || count < 1 || count > 100) {
                toast(t('数量应为 1–100'), true);
                return;
              }
              setOutput(Array.from({ length: count }, () => crypto.randomUUID()).join('\n'));
            }}
          >
            <RefreshCw size={16} />
            {t('生成')}
          </button>
          <button className="button" onClick={() => void copy()}>
            <Copy size={16} />
            {t('全部复制')}
          </button>
          <ResultActions result={{ type: 'text', text: output }} />
        </div>
        <textarea
          className="code-editor uuid-output"
          aria-label={t('生成的 UUID')}
          readOnly
          value={output}
        />
      </div>
    );
  return (
    <div className="standard-panel editor-tool">
      <PanelHeader title={t('编码转换')} />
      <div className="tool-buttons">
        <select
          aria-label={t('编码类型')}
          value={mode}
          onChange={(e) => {
            setMode(e.target.value);
            setOutput('');
            setError('');
          }}
        >
          <option value="base64">Base64</option>
          <option value="url">{t('URL 组件')}</option>
        </select>
        <button className="button primary" onClick={() => process('encode')}>
          {t('编码')}
        </button>
        <button className="button" onClick={() => process('decode')}>
          {t('解码')}
        </button>
        <span className="flex-spacer" />
        <ResultActions result={{ type: 'text', text: output }} />
        <button className="button" disabled={!output} onClick={() => void copy()}>
          <Copy size={16} />
          {t('复制结果')}
        </button>
      </div>
      <div className="editor-columns">
        <div>
          <label>{t('输入')}</label>
          <textarea
            className="code-editor"
            aria-label={t('工具输入')}
            value={input}
            maxLength={500000}
            spellCheck={false}
            placeholder={t('输入要转换的文本…')}
            onChange={(e) => setInput(e.target.value)}
          />
        </div>
        <div>
          <label>{t('结果')}</label>
          <textarea
            className={`code-editor ${error ? 'has-error' : ''}`}
            aria-label={t('工具结果')}
            readOnly
            value={error || output}
            spellCheck={false}
          />
        </div>
      </div>
      <div className="tool-status">
        {error ? (
          <span className="error-text">{error}</span>
        ) : (
          t('{{v0}} 字符', { v0: input.length, count: input.length })
        )}
      </div>
    </div>
  );
}
function localDateInput(date: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}
export function WebPanel() {
  const { state, toast, dialog } = useApp();
  const [name, setName] = useState(''),
    [url, setUrl] = useState(''),
    [type, setType] = useState<'fixed' | 'search'>('fixed'),
    [editing, setEditing] = useState<string | null>(null);
  const clear = () => {
    setName('');
    setUrl('');
    setType('fixed');
    setEditing(null);
  };
  const save = async () => {
    try {
      const target = /^https?:\/\//i.test(url.trim()) ? url.trim() : 'https://' + url.trim();
      const entry = validateWebShortcut({
        id: editing || crypto.randomUUID(),
        name: name.trim(),
        url: target,
        type,
      });
      await api('webShortcut', { action: 'save', entry });
      clear();
      toast(t('已保存'));
    } catch (e) {
      toast(errorText(e), true);
    }
  };
  const open = async (entry: WebShortcut) => {
    try {
      if (entry.type === 'search') {
        const query = await dialog({
          title: t('搜索 ') + entry.name,
          input: '',
          placeholder: t('输入搜索内容'),
          confirm: t('搜索'),
        });
        if (typeof query !== 'string' || !query.trim()) return;
        await api('launch', { id: 'web:' + entry.id, query });
      } else await api('launch', { id: 'web:' + entry.id });
    } catch (e) {
      toast(errorText(e), true);
    }
  };
  return (
    <div className="standard-panel scroll-panel">
      <PanelHeader title={t('网页快开')} />
      <form
        className="web-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <select
          aria-label={t('网页类型')}
          value={type}
          onChange={(e) => setType(e.target.value as 'fixed' | 'search')}
        >
          <option value="fixed">{t('固定网址')}</option>
          <option value="search">{t('搜索模板')}</option>
        </select>
        <input
          aria-label={t('网站名称')}
          value={name}
          placeholder={t('名称，例如 GitHub')}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          aria-label={t('网站地址')}
          value={url}
          placeholder={
            type === 'search' ? 'https://example.com/search?q={query}' : 'https://example.com'
          }
          onChange={(e) => setUrl(e.target.value)}
        />
        <button className="button primary" type="submit">
          <Plus size={16} />
          {editing ? t('保存') : t('添加')}
        </button>
        {editing && (
          <button className="button quiet" type="button" onClick={clear}>
            {t('取消')}
          </button>
        )}
      </form>
      {!state.settings.webShortcuts.length ? (
        <Empty icon={<Globe size={30} />}>{t('还没有网页快捷方式')}</Empty>
      ) : (
        <div className="simple-list">
          {state.settings.webShortcuts.map((item) => (
            <div key={item.id} className="web-item">
              <Globe size={24} />
              <button className="web-link" onClick={() => void open(item)}>
                <strong>
                  {item.name}
                  {item.type === 'search' ? t(' · 搜索') : ''}
                </strong>
                <span>{item.url}</span>
              </button>
              <div className="web-edit-actions">
                <IconButton
                  title={t('编辑 ') + item.name}
                  onClick={() => {
                    setEditing(item.id);
                    setName(item.name);
                    setUrl(item.url);
                    setType(item.type || 'fixed');
                  }}
                >
                  <Pencil size={16} />
                </IconButton>
                <IconButton
                  title={t('删除 ') + item.name}
                  onClick={async () => {
                    if (
                      await dialog({
                        title: t('删除网页快捷方式？'),
                        message: item.name,
                        confirm: t('删除'),
                        danger: true,
                      })
                    )
                      void api('webShortcut', { action: 'remove', id: item.id })
                        .then(() => {
                          if (editing === item.id) clear();
                        })
                        .catch((e) => toast(errorText(e), true));
                  }}
                >
                  <Trash2 size={16} />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
