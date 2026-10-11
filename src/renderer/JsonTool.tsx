import { useState, useRef, useEffect, useMemo } from 'react';
import { Copy, Minimize2, Maximize2, ArrowLeftRight, ChevronRight, ChevronDown, ArrowDown, Braces, Code2, ListTree, Check } from 'lucide-react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { json } from '@codemirror/lang-json';
import { foldAll, unfoldAll } from '@codemirror/language';
import { MergeView, goToNextChunk } from '@codemirror/merge';
import { formatJson, normalizeJson, parseJson, JSON_LIMIT, type JsonNode } from '../shared/json-tools';
import { api, useApp, errorText, IconButton } from './common';
import './json.css';

const editorTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '12px', color: 'var(--text)', backgroundColor: 'var(--surface)' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'Consolas, "SFMono-Regular", monospace' },
  '.cm-content': { padding: '10px 0', caretColor: 'var(--text)' },
  '.cm-gutters': { backgroundColor: 'var(--bg)', color: 'var(--muted)', border: 'none', minWidth: '35px' },
  '.cm-activeLine,.cm-activeLineGutter': { backgroundColor: 'var(--selected)' },
  '.cm-selectionBackground': { backgroundColor: '#a7c7fa55 !important' },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor': { borderLeftColor: 'var(--text)' }
});

function JsonEditor({ value, onChange, label, readOnly = false, editorRef }: { value: string; onChange?: (value: string) => void; label: string; readOnly?: boolean; editorRef?: React.RefObject<EditorView | null> }) {
  const {toast}=useApp();
  const parent = useRef<HTMLDivElement>(null), view = useRef<EditorView | null>(null), change = useRef(onChange);
  change.current = onChange;
  useEffect(() => {
    const instance = new EditorView({ parent: parent.current!, doc: value, extensions: [basicSetup, json(), editorTheme, EditorView.contentAttributes.of({ 'aria-label': label }), EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly), EditorState.transactionFilter.of(tr => {if(tr.newDoc.length>JSON_LIMIT){queueMicrotask(()=>toast('JSON 最多支持 50 万字符，请缩小内容后重试',true));return [];}return tr;}), EditorView.updateListener.of(update => { if (update.docChanged) change.current?.(update.state.doc.toString()); })] });
    view.current = instance; if (editorRef) editorRef.current = instance;
    return () => { instance.destroy(); view.current = null; if (editorRef) editorRef.current = null; };
  }, [label, readOnly]);
  useEffect(() => { const instance = view.current; if (instance && instance.state.doc.toString() !== value) instance.dispatch({ changes: { from: 0, to: instance.state.doc.length, insert: value } }); }, [value]);
  return <div ref={parent} className="json-editor" />;
}

function JsonBranch({ node, source, label, depth = 0, expand }: { node: JsonNode; source: string; label?: string; depth?: number; expand: 'default' | 'open' | 'closed' }) {
  const [open, setOpen] = useState(depth < 2);
  useEffect(() => { if (expand !== 'default') setOpen(expand === 'open'); }, [expand]);
  const branch = node.type === 'object' || node.type === 'array';
  const children = node.children || [], left = node.type === 'object' ? '{' : '[', right = node.type === 'object' ? '}' : ']';
  const literal = source.slice(node.offset, node.offset + node.length);
  return <div className="json-tree-node">
    <div className="json-tree-line">
      {branch ? <button className="json-fold" aria-label={`${open ? '折叠' : '展开'} ${label || '根节点'}`} onClick={() => setOpen(!open)}>{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</button> : <span className="json-fold" />}
      {label !== undefined && <><span className="json-key">{JSON.stringify(label)}</span><span>: </span></>}
      {branch ? <><span>{left}</span>{!open && <><button className="json-collapsed" onClick={() => setOpen(true)}> {children.length} 项 </button><span>{right}</span></>}</> : <span className={`json-value json-${node.type}`}>{literal}</span>}
    </div>
    {branch && open && <div className="json-tree-children">{children.map((child, i) => { const property = node.type === 'object'; return <JsonBranch key={child.offset} node={property ? child.children![1] : child} source={source} label={property ? child.children![0].value : undefined} depth={depth + 1} expand={expand} />; })}<div className="json-tree-end">{right}</div></div>}
  </div>;
}

export function JsonTool({ initial }: { initial: string }) {
  const { toast } = useApp();
  const [tab, setTab] = useState<'format' | 'diff'>('format'), [input, setInput] = useState(initial), [output, setOutput] = useState('');
  const [error, setError] = useState(''), [tree, setTree] = useState(true), [expand, setExpand] = useState<'default' | 'open' | 'closed'>('default');
  const [before, setBefore] = useState(''), [after, setAfter] = useState(''), [ignoreOrder, setIgnoreOrder] = useState(true);
  const [comparison, setComparison] = useState<{ a: string; b: string } | null>(null), [changes, setChanges] = useState(0);
  const diffParent = useRef<HTMLDivElement>(null), merge = useRef<MergeView | null>(null), outputEditor = useRef<EditorView | null>(null);
  const root = useMemo(() => { if (!output) return null; try { return parseJson(output); } catch { return null; } }, [output]);
  const format = (compact = false) => { try { setOutput(formatJson(input, compact)); setError(''); setExpand('default'); } catch (e) { setOutput(''); setError(errorText(e)); } };
  useEffect(() => { if (!input.trim()) { setOutput(''); setError(''); return; } const timer = setTimeout(() => format(), 220); return () => clearTimeout(timer); }, [input]);
  const copy = async (value: string) => { try { await api('clipAction', { action: 'writeText', text: value }); toast('已复制'); } catch (e) { toast(errorText(e), true); } };
  const compare = () => { try { setComparison({ a: normalizeJson(before, ignoreOrder), b: normalizeJson(after, ignoreOrder) }); setError(''); } catch (e) { setError(errorText(e)); setComparison(null); } };
  useEffect(() => {
    if (tab !== 'diff' || !comparison || !diffParent.current) return;
    const extensions = [basicSetup, json(), editorTheme, EditorState.readOnly.of(true), EditorView.editable.of(false)];
    const instance = new MergeView({ parent: diffParent.current, a: { doc: comparison.a, extensions: [...extensions, EditorView.contentAttributes.of({ 'aria-label': '原始 JSON 差异' })] }, b: { doc: comparison.b, extensions: [...extensions, EditorView.contentAttributes.of({ 'aria-label': '修改后的 JSON 差异' })] }, highlightChanges: true, gutter: true, diffConfig: { scanLimit: 2000, timeout: 200 } });
    merge.current = instance; setChanges(instance.chunks.length);
    return () => { instance.destroy(); merge.current = null; };
  }, [tab, comparison]);
  return <div className="json-tool">
    <div className="json-toolbar"><div className="json-tabs" role="tablist"><button role="tab" aria-selected={tab === 'format'} onClick={() => { setTab('format'); setError(''); }}><Braces size={14} />格式化</button><button role="tab" aria-selected={tab === 'diff'} onClick={() => { setTab('diff'); setError(''); }}><ArrowLeftRight size={14} />JSON 对比</button></div><span className="flex-spacer" />
      {tab === 'format' ? <><button className="button small" onClick={() => format()}>格式化</button><button className="button small" onClick={() => format(true)}>压缩</button></> : <><label className="json-order"><input type="checkbox" checked={ignoreOrder} onChange={e => { setIgnoreOrder(e.target.checked); setComparison(null); }} />忽略键顺序</label>{comparison ? <button className="button small" onClick={() => setComparison(null)}>编辑输入</button> : <button className="button primary small" onClick={compare}>开始对比</button>}</>}
    </div>
    {error && <div className="json-error has-error" role="alert">{error}</div>}
    {tab === 'format' ? <div className="json-split">
      <section className="json-pane"><div className="json-pane-heading"><strong>输入</strong><span className="flex-spacer" /><span>{input.length.toLocaleString()} 字符</span><button onClick={() => setInput('')}>清空</button></div><JsonEditor value={input} onChange={setInput} label="JSON 输入" /></section>
      <section className="json-pane"><div className="json-pane-heading"><strong>解析结果</strong><span className="flex-spacer" /><IconButton title={tree ? '切换代码视图' : '切换树形视图'} onClick={() => setTree(!tree)}>{tree ? <Code2 size={14} /> : <ListTree size={14} />}</IconButton><IconButton title="全部展开" onClick={() => { setExpand('open'); if (outputEditor.current) unfoldAll(outputEditor.current); }}><Maximize2 size={14} /></IconButton><IconButton title="全部折叠" onClick={() => { setExpand('closed'); if (outputEditor.current) foldAll(outputEditor.current); }}><Minimize2 size={14} /></IconButton><IconButton title="复制 JSON 结果" disabled={!output} onClick={() => void copy(output)}><Copy size={14} /></IconButton></div>
        {tree ? <div className="json-tree" aria-label="JSON 解析结果">{root ? <JsonBranch key={output} node={root} source={output} expand={expand} /> : <div className="json-empty">{error ? '修正输入后查看解析结果' : '在左侧粘贴 JSON，自动格式化与校验'}</div>}</div> : <JsonEditor value={output} label="JSON 格式化结果" readOnly editorRef={outputEditor} />}
      </section>
    </div> : <>
      <div className="json-diff-head"><span>原始 JSON <small className="diff-minus">− 删除 / 旧值</small></span><span>修改后的 JSON <small className="diff-plus">+ 新增 / 新值</small></span></div>
      {comparison ? <div className="json-merge" ref={diffParent} /> : <div className="json-split diff-inputs"><section className="json-pane"><JsonEditor value={before} onChange={setBefore} label="原始 JSON" /></section><section className="json-pane"><JsonEditor value={after} onChange={setAfter} label="修改后的 JSON" /></section></div>}
      <div className="json-status">{comparison ? <><span>{changes ? `${changes} 处差异` : <><Check size={12} /> 内容一致</>}</span>{changes > 0 && <button onClick={() => { if (merge.current) { merge.current.a.focus(); goToNextChunk(merge.current.a); } }}><ArrowDown size={12} />下一处差异</button>}</> : <span>粘贴两份 JSON 后开始对比；数组顺序参与比较</span>}<span className="flex-spacer" /><span>仅在本机处理</span></div>
    </>}
  </div>;
}
