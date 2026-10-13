import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from './common';
interface SearchState { text: string; placeholder: string; visible: boolean; results: { id: string; title: string; description?: string }[]; }
export function usePluginSearch() {
  const [state, setState] = useState<SearchState | null>(null);
  const refresh = useCallback(() => { void api<SearchState | null>('window', { action: 'pluginSearch', operation: 'read' }).then(setState).catch(() => setState(null)); }, []);
  useEffect(() => { refresh(); return window.nexlet.onChange(event => { if (event === 'plugin-ui-changed' || event === 'plugin-changed') refresh(); }); }, [refresh]);
  return { state, change: (text: string) => { setState(current => current ? { ...current, text } : current); return api('window', { action: 'pluginSearch', operation: 'change', text }); } };
}
export function PluginSearchResults({ results, error }: { results: NonNullable<ReturnType<typeof usePluginSearch>['state']>['results']; error(message: string): void }) {
  return <div className="plugin-search-results" role="list" aria-label="插件搜索结果">{results.map(row => <button key={row.id} className="plugin-search-result" role="listitem" onClick={() => { void api('window', { action: 'pluginSearch', operation: 'select', id: row.id }).catch(e => error(errorText(e))); }}><strong>{row.title}</strong>{row.description && <span>{row.description}</span>}</button>)}</div>;
}
