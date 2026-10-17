import { formatLocale, t } from '../shared/i18n';
import { useToolState, useRestoreBarrier } from './tool-session';
import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Copy,
  Minimize2,
  Maximize2,
  ArrowLeftRight,
  ChevronRight,
  ChevronDown,
  ArrowDown,
  Braces,
  Code2,
  ListTree,
  Check,
} from 'lucide-react';
import { EditorView, basicSetup } from 'codemirror';
import { Compartment, EditorState } from '@codemirror/state';
import { json } from '@codemirror/lang-json';
import { foldAll, unfoldAll } from '@codemirror/language';
import { MergeView, goToNextChunk } from '@codemirror/merge';
import {
  formatJson,
  normalizeJson,
  parseJson,
  JSON_LIMIT,
  type JsonNode,
} from '../shared/json-tools';
import { api, useApp, errorText, IconButton } from './common';
import './json.css';

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '12px',
    color: 'var(--text)',
    backgroundColor: 'var(--surface)',
  },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'Consolas, "SFMono-Regular", monospace' },
  '.cm-content': { padding: '10px 0', caretColor: 'var(--text)' },
  '.cm-gutters': {
    backgroundColor: 'var(--bg)',
    color: 'var(--muted)',
    border: 'none',
    minWidth: '35px',
  },
  '.cm-activeLine,.cm-activeLineGutter': { backgroundColor: 'var(--selected)' },
  '.cm-selectionBackground': { backgroundColor: '#a7c7fa55 !important' },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor': { borderLeftColor: 'var(--text)' },
});

function JsonEditor({
  value,
  onChange,
  label,
  readOnly = false,
  editorRef,
}: {
  value: string;
  onChange?: (value: string) => void;
  label: string;
  readOnly?: boolean;
  editorRef?: React.RefObject<EditorView | null>;
}) {
  const { toast } = useApp();
  const parent = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | null>(null),
    change = useRef(onChange);
  change.current = onChange;
  const labelConfig = useRef(new Compartment());
  useEffect(() => {
    const instance = new EditorView({
      parent: parent.current!,
      doc: value,
      extensions: [
        basicSetup,
        json(),
        editorTheme,
        labelConfig.current.of(EditorView.contentAttributes.of({ 'aria-label': label })),
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        EditorState.transactionFilter.of((tr) => {
          if (tr.newDoc.length > JSON_LIMIT) {
            queueMicrotask(() => toast(t('JSON 最多支持 50 万字符，请缩小内容后重试'), true));
            return [];
          }
          return tr;
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) change.current?.(update.state.doc.toString());
        }),
      ],
    });
    view.current = instance;
    if (editorRef) editorRef.current = instance;
    return () => {
      instance.destroy();
      view.current = null;
      if (editorRef) editorRef.current = null;
    };
  }, [readOnly]);
  useEffect(() => {
    view.current?.dispatch({
      effects: labelConfig.current.reconfigure(
        EditorView.contentAttributes.of({ 'aria-label': label }),
      ),
    });
  }, [label]);
  useEffect(() => {
    const instance = view.current;
    if (instance && instance.state.doc.toString() !== value)
      instance.dispatch({ changes: { from: 0, to: instance.state.doc.length, insert: value } });
  }, [value]);
  return <div ref={parent} className="json-editor" />;
}

function JsonBranch({
  node,
  source,
  label,
  depth = 0,
  expand,
}: {
  node: JsonNode;
  source: string;
  label?: string;
  depth?: number;
  expand: 'default' | 'open' | 'closed';
}) {
  const [open, setOpen] = useState(depth < 2);
  useEffect(() => {
    if (expand !== 'default') setOpen(expand === 'open');
  }, [expand]);
  const branch = node.type === 'object' || node.type === 'array';
  const children = node.children || [],
    left = node.type === 'object' ? '{' : '[',
    right = node.type === 'object' ? '}' : ']';
  const literal = source.slice(node.offset, node.offset + node.length);
  return (
    <div className="json-tree-node">
      <div className="json-tree-line">
        {branch ? (
          <button
            className="json-fold"
            aria-label={`${open ? t('折叠') : t('展开')} ${label || t('根节点')}`}
            onClick={() => setOpen(!open)}
          >
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="json-fold" />
        )}
        {label !== undefined && (
          <>
            <span className="json-key">{JSON.stringify(label)}</span>
            <span>: </span>
          </>
        )}
        {branch ? (
          <>
            <span>{left}</span>
            {!open && (
              <>
                <button className="json-collapsed" onClick={() => setOpen(true)}>
                  {' '}
                  {t('{{v0}} 项', { v0: children.length, count: children.length })}
                </button>
                <span>{right}</span>
              </>
            )}
          </>
        ) : (
          <span className={`json-value json-${node.type}`}>{literal}</span>
        )}
      </div>
      {branch && open && (
        <div className="json-tree-children">
          {children.map((child) => {
            const property = node.type === 'object';
            return (
              <JsonBranch
                key={child.offset}
                node={property ? child.children![1] : child}
                source={source}
                label={property ? child.children![0].value : undefined}
                depth={depth + 1}
                expand={expand}
              />
            );
          })}
          <div className="json-tree-end">{right}</div>
        </div>
      )}
    </div>
  );
}

export function JsonTool({ initial }: { initial: string }) {
  const { toast } = useApp();
  const [tab, setTab] = useToolState<'format' | 'diff'>('tab', 'format'),
    [input, setInput] = useToolState('input', initial),
    [output, setOutput] = useToolState('output', '');
  const [error, setError] = useToolState('error', ''),
    [tree, setTree] = useToolState('tree', true),
    [expand, setExpand] = useToolState<'default' | 'open' | 'closed'>('expand', 'default');
  const [before, setBefore] = useToolState('before', ''),
    [after, setAfter] = useToolState('after', ''),
    [ignoreOrder, setIgnoreOrder] = useToolState('ignoreOrder', true);
  const [comparison, setComparison] = useToolState<{ a: string; b: string } | null>(
      'comparison',
      null,
    ),
    [changes, setChanges] = useToolState('changes', 0);
  const diffParent = useRef<HTMLDivElement>(null),
    merge = useRef<MergeView | null>(null),
    outputEditor = useRef<EditorView | null>(null);
  const diffLabels = useRef({ a: new Compartment(), b: new Compartment() });
  const beforeLabel = t('原始 JSON 差异'),
    afterLabel = t('修改后的 JSON 差异');
  const root = useMemo(() => {
    if (!output) return null;
    try {
      return parseJson(output);
    } catch {
      return null;
    }
  }, [output]);
  const format = (compact = false) => {
    try {
      setOutput(formatJson(input, compact));
      setError('');
      setExpand('default');
    } catch (e) {
      setOutput('');
      setError(errorText(e));
    }
  };
  const restore = useRestoreBarrier(),
    firstFormat = useRef(true);
  useEffect(() => {
    if (firstFormat.current) {
      firstFormat.current = false;
      if (restore && 'output' in restore.initial) return;
    }
    if (!input.trim()) {
      setOutput('');
      setError('');
      return;
    }
    const timer = setTimeout(() => format(), 220);
    return () => clearTimeout(timer);
  }, [input]);
  const copy = async (value: string) => {
    try {
      await api('clipAction', { action: 'writeText', text: value });
      toast(t('已复制'));
    } catch (e) {
      toast(errorText(e), true);
    }
  };
  const compare = () => {
    try {
      setComparison({
        a: normalizeJson(before, ignoreOrder),
        b: normalizeJson(after, ignoreOrder),
      });
      setError('');
    } catch (e) {
      setError(errorText(e));
      setComparison(null);
    }
  };
  useEffect(() => {
    if (tab !== 'diff' || !comparison || !diffParent.current) return;
    const extensions = [
      basicSetup,
      json(),
      editorTheme,
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
    ];
    const instance = new MergeView({
      parent: diffParent.current,
      a: {
        doc: comparison.a,
        extensions: [
          ...extensions,
          diffLabels.current.a.of(EditorView.contentAttributes.of({ 'aria-label': beforeLabel })),
        ],
      },
      b: {
        doc: comparison.b,
        extensions: [
          ...extensions,
          diffLabels.current.b.of(EditorView.contentAttributes.of({ 'aria-label': afterLabel })),
        ],
      },
      highlightChanges: true,
      gutter: true,
      diffConfig: { scanLimit: 2000, timeout: 200 },
    });
    merge.current = instance;
    setChanges(instance.chunks.length);
    return () => {
      instance.destroy();
      merge.current = null;
    };
  }, [tab, comparison]);
  useEffect(() => {
    merge.current?.a.dispatch({
      effects: diffLabels.current.a.reconfigure(
        EditorView.contentAttributes.of({ 'aria-label': beforeLabel }),
      ),
    });
    merge.current?.b.dispatch({
      effects: diffLabels.current.b.reconfigure(
        EditorView.contentAttributes.of({ 'aria-label': afterLabel }),
      ),
    });
  }, [beforeLabel, afterLabel]);
  return (
    <div className="json-tool">
      <div className="json-toolbar">
        <div className="json-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'format'}
            onClick={() => {
              setTab('format');
              setError('');
            }}
          >
            <Braces size={14} />
            {t('格式化')}
          </button>
          <button
            role="tab"
            aria-selected={tab === 'diff'}
            onClick={() => {
              setTab('diff');
              setError('');
            }}
          >
            <ArrowLeftRight size={14} />
            {t('JSON 对比')}
          </button>
        </div>
        <span className="flex-spacer" />
        {tab === 'format' ? (
          <>
            <button className="button small" onClick={() => format()}>
              {t('格式化')}
            </button>
            <button className="button small" onClick={() => format(true)}>
              {t('压缩')}
            </button>
          </>
        ) : (
          <>
            <label className="json-order">
              <input
                type="checkbox"
                checked={ignoreOrder}
                onChange={(e) => {
                  setIgnoreOrder(e.target.checked);
                  setComparison(null);
                }}
              />
              {t('忽略键顺序')}
            </label>
            {comparison ? (
              <button className="button small" onClick={() => setComparison(null)}>
                {t('编辑输入')}
              </button>
            ) : (
              <button className="button primary small" onClick={compare}>
                {t('开始对比')}
              </button>
            )}
          </>
        )}
      </div>
      {error && (
        <div className="json-error has-error" role="alert">
          {error}
        </div>
      )}
      {tab === 'format' ? (
        <div className="json-split">
          <section className="json-pane">
            <div className="json-pane-heading">
              <strong>{t('输入')}</strong>
              <span className="flex-spacer" />
              <span>
                {t('{{v0}} 字符', {
                  v0: input.length.toLocaleString(formatLocale()),
                  count: input.length,
                })}
              </span>
              <button onClick={() => setInput('')}>{t('清空')}</button>
            </div>
            <JsonEditor value={input} onChange={setInput} label={t('JSON 输入')} />
          </section>
          <section className="json-pane">
            <div className="json-pane-heading">
              <strong>{t('解析结果')}</strong>
              <span className="flex-spacer" />
              <IconButton
                title={tree ? t('切换代码视图') : t('切换树形视图')}
                onClick={() => setTree(!tree)}
              >
                {tree ? <Code2 size={14} /> : <ListTree size={14} />}
              </IconButton>
              <IconButton
                title={t('全部展开')}
                onClick={() => {
                  setExpand('open');
                  if (outputEditor.current) unfoldAll(outputEditor.current);
                }}
              >
                <Maximize2 size={14} />
              </IconButton>
              <IconButton
                title={t('全部折叠')}
                onClick={() => {
                  setExpand('closed');
                  if (outputEditor.current) foldAll(outputEditor.current);
                }}
              >
                <Minimize2 size={14} />
              </IconButton>
              <IconButton
                title={t('复制 JSON 结果')}
                disabled={!output}
                onClick={() => void copy(output)}
              >
                <Copy size={14} />
              </IconButton>
            </div>
            {tree ? (
              <div className="json-tree" aria-label={t('JSON 解析结果')}>
                {root ? (
                  <JsonBranch key={output} node={root} source={output} expand={expand} />
                ) : (
                  <div className="json-empty">
                    {error ? t('修正输入后查看解析结果') : t('在左侧粘贴 JSON，自动格式化与校验')}
                  </div>
                )}
              </div>
            ) : (
              <JsonEditor
                value={output}
                label={t('JSON 格式化结果')}
                readOnly
                editorRef={outputEditor}
              />
            )}
          </section>
        </div>
      ) : (
        <>
          <div className="json-diff-head">
            <span>
              {t('原始 JSON')}
              <small className="diff-minus">{t('− 删除 / 旧值')}</small>
            </span>
            <span>
              {t('修改后的 JSON')}
              <small className="diff-plus">{t('+ 新增 / 新值')}</small>
            </span>
          </div>
          {comparison ? (
            <div className="json-merge" ref={diffParent} />
          ) : (
            <div className="json-split diff-inputs">
              <section className="json-pane">
                <JsonEditor value={before} onChange={setBefore} label={t('原始 JSON')} />
              </section>
              <section className="json-pane">
                <JsonEditor value={after} onChange={setAfter} label={t('修改后的 JSON')} />
              </section>
            </div>
          )}
          <div className="json-status">
            {comparison ? (
              <>
                <span>
                  {changes ? (
                    t('{{v0}} 处差异', { v0: changes, count: changes })
                  ) : (
                    <>
                      <Check size={12} />
                      {t('内容一致')}
                    </>
                  )}
                </span>
                {changes > 0 && (
                  <button
                    onClick={() => {
                      if (merge.current) {
                        merge.current.a.focus();
                        goToNextChunk(merge.current.a);
                      }
                    }}
                  >
                    <ArrowDown size={12} />
                    {t('下一处差异')}
                  </button>
                )}
              </>
            ) : (
              <span>{t('粘贴两份 JSON 后开始对比；数组顺序参与比较')}</span>
            )}
            <span className="flex-spacer" />
            <span>{t('仅在本机处理')}</span>
          </div>
        </>
      )}
    </div>
  );
}
