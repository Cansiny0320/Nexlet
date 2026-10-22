import { useEffect, useState } from 'react';
import { Plus, Trash2, Play, ArrowUp, ArrowDown } from 'lucide-react';
import { t } from '../shared/i18n';
import {
  defaultProductivity,
  snippetVariables,
  validateSnippet,
  validateWorkspace,
  type Snippet,
  type Workspace,
  type WorkspaceItem,
  type WorkspaceResult,
} from '../shared/productivity';
import { api, errorText, useApp, PanelHeader } from './common';
import { useToolState, useRestoreBarrier } from './tool-session';
import { ResultActions } from './ActionMenu';
import './productivity.css';

function useProductivity() {
  const [config, setConfig] = useState(defaultProductivity),
    [loaded, setLoaded] = useState(false);
  const { toast } = useApp();
  useEffect(() => {
    let live = true;
    const load = () =>
      void api('productivity', { action: 'read' })
        .then((value) => {
          if (live) {
            setConfig(value);
            setLoaded(true);
          }
        })
        .catch((error) => toast(errorText(error), true));
    load();
    const unsubscribe = window.nexlet.onChange((event) => {
      if (event === 'state') load();
    });
    return () => {
      live = false;
      unsubscribe();
    };
  }, [toast]);
  return {
    config,
    loaded,
    save: async (next: typeof config) => {
      const value = await api('productivity', { action: 'save', value: next });
      setConfig(value);
    },
  };
}
function activation(initial: string): { id?: string; run?: boolean } {
  try {
    return JSON.parse(initial);
  } catch {
    return {};
  }
}
const blankSnippet = (): Snippet => ({ id: crypto.randomUUID(), name: '', group: '', body: '' });
export function SnippetsPanel({ initial }: { initial: string }) {
  const session = useRestoreBarrier();
  const { config, loaded, save } = useProductivity();
  const { toast, dialog, state } = useApp();
  const [draft, setDraft] = useToolState<Snippet>('snippet', blankSnippet),
    [query, setQuery] = useToolState('snippetQuery', ''),
    [group, setGroup] = useToolState('group', ''),
    [values, setValues] = useToolState<Record<string, string>>('variables', {}),
    [preview, setPreview] = useToolState('preview', ''),
    [error, setError] = useState('');
  const [activated, setActivated] = useState(false);
  useEffect(() => {
    if (!loaded || activated) return;
    setActivated(true);
    if (session?.initial.snippet) return;
    const id = activation(initial).id,
      snippet = config.snippets.find((item) => item.id === id);
    if (snippet) {
      setDraft(snippet);
      setValues({});
      setPreview('');
    }
  }, [loaded, config, activated, initial]);
  let variables: string[] = [],
    templateError = '';
  try {
    variables = snippetVariables(draft.body);
  } catch (error) {
    templateError = errorText(error);
  }
  const change = (patch: Partial<Snippet>) => {
    setDraft({ ...draft, ...patch });
    setPreview('');
    setError('');
  };
  const select = (item: Snippet) => {
    setDraft(item);
    setValues({});
    setPreview('');
    setError('');
  };
  const persist = async () => {
    try {
      const snippet = validateSnippet(draft);
      await save({
        ...config,
        snippets: config.snippets.some((item) => item.id === snippet.id)
          ? config.snippets.map((item) => (item.id === snippet.id ? snippet : item))
          : [...config.snippets, snippet],
      });
      setError('');
      toast(t('已保存'));
    } catch (error) {
      setError(errorText(error));
    }
  };
  return (
    <div className="standard-panel productivity-panel">
      <PanelHeader title={t('快捷短语')} description={t('预览变量替换结果，再复制或回贴')} />
      <div className="productivity-columns">
        <aside className="productivity-list">
          <button className="button" onClick={() => select(blankSnippet())}>
            <Plus size={16} />
            {t('新建短语')}
          </button>
          <input
            aria-label={t('搜索短语')}
            placeholder={t('搜索短语')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            aria-label={t('短语分组')}
            value={group}
            onChange={(event) => setGroup(event.target.value)}
          >
            <option value="">{t('全部分组')}</option>
            {[...new Set(config.snippets.map((item) => item.group).filter(Boolean))]
              .sort()
              .map((name) => (
                <option key={name}>{name}</option>
              ))}
          </select>
          <div className="scroll-panel">
            {config.snippets
              .filter(
                (item) =>
                  (!group || item.group === group) &&
                  `${item.name} ${item.group} ${item.body}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
              )
              .map((item) => (
                <button
                  key={item.id}
                  className={draft.id === item.id ? 'active' : ''}
                  onClick={() => select(item)}
                >
                  <strong>{item.name}</strong>
                  <small>{item.group || t('未分组')}</small>
                </button>
              ))}
          </div>
        </aside>
        <div className="productivity-editor scroll-panel">
          <label>
            {t('名称')}
            <input
              aria-label={t('短语名称')}
              maxLength={80}
              value={draft.name}
              onChange={(event) => change({ name: event.target.value })}
            />
          </label>
          <label>
            {t('分组')}
            <input
              aria-label={t('分组')}
              maxLength={60}
              value={draft.group}
              onChange={(event) => change({ group: event.target.value })}
            />
          </label>
          <label>
            {t('内容')}
            <textarea
              className="code-editor"
              aria-label={t('短语内容')}
              maxLength={50_000}
              value={draft.body}
              onChange={(event) => change({ body: event.target.value })}
            />
          </label>
          <p className="muted">
            {'{{date:YYYY-MM-DD}} · {{clipboard}} · {{input:' + t('姓名') + '}}'}
          </p>
          {variables.map((name) => (
            <label key={name}>
              {name}
              <input
                aria-label={t('变量：{{v0}}', { v0: name })}
                value={values[name] ?? ''}
                onChange={(event) => {
                  setValues({ ...values, [name]: event.target.value });
                  setPreview('');
                }}
              />
            </label>
          ))}
          {(error || templateError) && (
            <p className="error-text" role="alert">
              {error || templateError}
            </p>
          )}
          <div className="tool-buttons">
            <button className="button primary" disabled={!loaded} onClick={() => void persist()}>
              {t('保存短语')}
            </button>
            <button
              className="button"
              disabled={!draft.body || !!templateError}
              onClick={async () => {
                try {
                  setPreview(await api('snippetPreview', { body: draft.body, values }));
                  setError('');
                } catch (error) {
                  setError(errorText(error));
                }
              }}
            >
              {t('预览变量')}
            </button>
            {config.snippets.some((item) => item.id === draft.id) && (
              <button
                className="button quiet"
                onClick={async () => {
                  if (
                    await dialog({
                      title: t('删除短语？'),
                      message: draft.name,
                      confirm: t('删除'),
                      danger: true,
                    })
                  )
                    try {
                      await save({
                        ...config,
                        snippets: config.snippets.filter((item) => item.id !== draft.id),
                      });
                      select(blankSnippet());
                    } catch (error) {
                      setError(errorText(error));
                    }
                }}
              >
                <Trash2 size={15} />
                {t('删除')}
              </button>
            )}
          </div>
          <label>
            {t('预览')}
            <textarea aria-label={t('短语预览')} className="code-editor" readOnly value={preview} />
          </label>
          <div className="tool-buttons">
            <button
              className="button"
              disabled={!preview}
              onClick={() =>
                void api('clipAction', { action: 'writeText', text: preview })
                  .then(() => toast(t('已复制')))
                  .catch((error) => setError(errorText(error)))
              }
            >
              {t('复制')}
            </button>
            <button
              className="button"
              disabled={!preview || !state.canPaste}
              onClick={() =>
                void api('clipAction', { action: 'pasteText', text: preview }).catch((error) =>
                  setError(errorText(error)),
                )
              }
            >
              {t('执行粘贴')}
            </button>
            <ResultActions result={{ type: 'text', text: preview }} />
          </div>
        </div>
      </div>
    </div>
  );
}

const blankWorkspace = (): Workspace => ({ id: crypto.randomUUID(), name: '', items: [] });
const kindLabels: Record<WorkspaceItem['kind'], string> = {
  app: '应用',
  folder: '目录',
  editor: '编辑器',
  terminal: '终端',
  url: '网页',
};
const statusLabels: Record<WorkspaceResult['status'], string> = {
  pending: '等待',
  running: '正在启动',
  success: '已启动',
  error: '失败',
  cancelled: '已取消',
};
export function WorkspacesPanel({ initial }: { initial: string }) {
  const session = useRestoreBarrier();
  const { config, loaded, save } = useProductivity();
  const { toast, dialog } = useApp();
  const [draft, setDraft] = useToolState<Workspace>('workspace', blankWorkspace),
    [results, setResults] = useToolState<WorkspaceResult[]>('workspaceResults', []),
    [error, setError] = useState(''),
    [running, setRunning] = useState(false),
    [activated, setActivated] = useState(false);
  const saved = config.workspaces.find((item) => item.id === draft.id);
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);
  const execute = async (workspace: Workspace, items?: string[]) => {
    setRunning(true);
    setError('');
    try {
      const next = await api('workspaceRun', { action: 'run', id: workspace.id, items });
      setResults((old) => [
        ...old.filter((item) => !next.some((value) => value.id === item.id)),
        ...next,
      ]);
    } catch (error) {
      setError(errorText(error));
    } finally {
      setRunning(false);
    }
  };
  useEffect(
    () =>
      window.nexlet.onChange((event) => {
        if (!event.startsWith('workspace-progress:')) return;
        const value = JSON.parse(event.slice(19)) as { id: string; results: WorkspaceResult[] };
        if (value.id === draft.id) {
          setResults((old) => [
            ...old.filter((item) => !value.results.some((next) => next.id === item.id)),
            ...value.results,
          ]);
          setRunning(
            value.results.some((item) => item.status === 'running' || item.status === 'pending'),
          );
        }
      }),
    [draft.id],
  );
  useEffect(() => {
    let active = true;
    void api('workspaceRun', { action: 'status', id: draft.id })
      .then((value) => {
        if (active && value.length) {
          setResults(value);
          setRunning(value.some((item) => item.status === 'running' || item.status === 'pending'));
        }
      })
      .catch((error) => {
        if (active) setError(errorText(error));
      });
    return () => {
      active = false;
    };
  }, [draft.id]);
  useEffect(() => {
    if (!loaded || activated) return;
    setActivated(true);
    if (session?.initial.workspace) return;
    const input = activation(initial),
      workspace = config.workspaces.find((item) => item.id === input.id);
    if (workspace) {
      setDraft(workspace);
      setResults([]);
      if (input.run) void execute(workspace);
    }
  }, [loaded, config, activated, initial]);
  const change = (id: string, patch: Partial<WorkspaceItem>) => {
    setDraft({
      ...draft,
      items: draft.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    });
    setError('');
  };
  const move = (index: number, offset: number) => {
    const items = [...draft.items];
    [items[index], items[index + offset]] = [items[index + offset], items[index]];
    setDraft({ ...draft, items });
  };
  return (
    <div className="standard-panel productivity-panel">
      <PanelHeader
        title={t('工作区')}
        description={t('保存一组启动项，按顺序打开；失败项目可单独重试')}
      />
      <div className="productivity-columns">
        <aside className="productivity-list">
          <button
            className="button"
            disabled={running}
            onClick={() => {
              setDraft(blankWorkspace());
              setResults([]);
            }}
          >
            <Plus size={16} />
            {t('新建工作区')}
          </button>
          <div className="scroll-panel">
            {config.workspaces.map((item) => (
              <button
                key={item.id}
                disabled={running}
                className={draft.id === item.id ? 'active' : ''}
                onClick={() => {
                  setDraft(item);
                  setResults([]);
                  setError('');
                }}
              >
                <strong>{item.name}</strong>
                <small>{t('{{v0}} 个项目', { v0: item.items.length })}</small>
              </button>
            ))}
          </div>
        </aside>
        <div className="productivity-editor scroll-panel">
          <label>
            {t('名称')}
            <input
              aria-label={t('工作区名称')}
              disabled={running}
              maxLength={80}
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>
          {draft.items.map((item, index) => (
            <fieldset className="workspace-item" disabled={running} key={item.id}>
              <legend>{index + 1}</legend>
              <div className="form-row">
                <select
                  aria-label={t('项目类型')}
                  value={item.kind}
                  onChange={(event) =>
                    change(item.id, { kind: event.target.value as WorkspaceItem['kind'] })
                  }
                >
                  {Object.entries(kindLabels).map(([kind, label]) => (
                    <option key={kind} value={kind}>
                      {t(label)}
                    </option>
                  ))}
                </select>
                <button
                  className="icon-button"
                  aria-label={t('上移项目')}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label={t('下移项目')}
                  disabled={index === draft.items.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label={t('删除项目')}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      items: draft.items.filter((entry) => entry.id !== item.id),
                    })
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="form-row">
                <input
                  aria-label={t('项目路径或网址')}
                  placeholder={item.kind === 'url' ? 'https://example.com' : t('绝对路径')}
                  value={item.target}
                  onChange={(event) => change(item.id, { target: event.target.value })}
                />
                {item.kind !== 'url' && (
                  <button
                    className="button"
                    onClick={async () => {
                      const path = await api('localPick', { directory: item.kind !== 'app' });
                      if (path) change(item.id, { target: path });
                    }}
                  >
                    {t('选择')}
                  </button>
                )}
              </div>
              {['editor', 'terminal'].includes(item.kind) && (
                <>
                  <div className="form-row">
                    <input
                      aria-label={t('程序路径')}
                      placeholder={
                        item.kind === 'terminal' ? t('留空使用系统终端') : t('编辑器可执行文件路径')
                      }
                      value={item.program || ''}
                      onChange={(event) => change(item.id, { program: event.target.value })}
                    />
                    <button
                      className="button"
                      onClick={async () => {
                        const path = await api('localPick', { directory: false });
                        if (path) change(item.id, { program: path });
                      }}
                    >
                      {t('选择程序')}
                    </button>
                  </div>
                  <textarea
                    aria-label={t('程序参数')}
                    placeholder={t('每行一个参数，路径会作为独立参数传入')}
                    value={(item.args || []).join('\n')}
                    onChange={(event) =>
                      change(item.id, {
                        args: event.target.value ? event.target.value.split('\n') : [],
                      })
                    }
                  />
                </>
              )}
              <div className="form-row">
                <button
                  className="button quiet"
                  disabled={dirty || running}
                  onClick={() => void execute(draft, [item.id])}
                >
                  <Play size={14} />
                  {t('单独运行')}
                </button>
                {results.find((result) => result.id === item.id) && (
                  <span
                    className={
                      results.find((result) => result.id === item.id)?.status === 'error'
                        ? 'error-text'
                        : 'muted'
                    }
                  >
                    {t(statusLabels[results.find((result) => result.id === item.id)!.status])}{' '}
                    {results.find((result) => result.id === item.id)?.error}
                  </span>
                )}
              </div>
            </fieldset>
          ))}
          <button
            className="button"
            disabled={running || draft.items.length >= 50}
            onClick={() =>
              setDraft({
                ...draft,
                items: [...draft.items, { id: crypto.randomUUID(), kind: 'folder', target: '' }],
              })
            }
          >
            <Plus size={16} />
            {t('添加项目')}
          </button>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <div className="tool-buttons">
            <button
              className="button primary"
              disabled={!loaded || running}
              onClick={async () => {
                try {
                  const workspace = validateWorkspace(draft);
                  await save({
                    ...config,
                    workspaces: saved
                      ? config.workspaces.map((item) =>
                          item.id === workspace.id ? workspace : item,
                        )
                      : [...config.workspaces, workspace],
                  });
                  setDraft(workspace);
                  setError('');
                  toast(t('已保存'));
                } catch (error) {
                  setError(errorText(error));
                }
              }}
            >
              {t('保存工作区')}
            </button>
            <button
              className="button"
              disabled={dirty || running || !draft.items.length}
              onClick={() => void execute(draft)}
            >
              <Play size={16} />
              {t('运行工作区')}
            </button>
            {running && (
              <button
                className="button"
                onClick={() => void api('workspaceRun', { action: 'cancel', id: draft.id })}
              >
                {t('取消后续项目')}
              </button>
            )}
            {results.some((item) => item.status === 'error') && (
              <button
                className="button"
                disabled={dirty || running}
                onClick={() =>
                  void execute(
                    draft,
                    results.filter((item) => item.status === 'error').map((item) => item.id),
                  )
                }
              >
                {t('重试失败项')}
              </button>
            )}
            {saved && (
              <button
                className="button quiet"
                disabled={running}
                onClick={async () => {
                  if (
                    await dialog({
                      title: t('删除工作区？'),
                      message: draft.name,
                      confirm: t('删除'),
                      danger: true,
                    })
                  )
                    try {
                      await save({
                        ...config,
                        workspaces: config.workspaces.filter((item) => item.id !== draft.id),
                      });
                      setDraft(blankWorkspace());
                      setResults([]);
                    } catch (error) {
                      setError(errorText(error));
                    }
                }}
              >
                {t('删除')}
              </button>
            )}
          </div>
          {dirty && saved && <p className="muted">{t('保存修改后即可运行')}</p>}
        </div>
      </div>
    </div>
  );
}
