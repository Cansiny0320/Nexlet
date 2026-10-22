import { t } from './i18n';

export interface Snippet {
  id: string;
  name: string;
  group: string;
  body: string;
}
export interface WorkspaceItem {
  id: string;
  kind: 'app' | 'folder' | 'editor' | 'terminal' | 'url';
  target: string;
  program?: string;
  args?: string[];
}
export interface Workspace {
  id: string;
  name: string;
  items: WorkspaceItem[];
}
export interface ProductivityConfig {
  version: 1;
  revision: number;
  snippets: Snippet[];
  workspaces: Workspace[];
}
export interface WorkspaceResult {
  id: string;
  status: 'pending' | 'running' | 'success' | 'error' | 'cancelled';
  error?: string;
}
export const defaultProductivity = (): ProductivityConfig => ({
  version: 1,
  revision: 0,
  snippets: [],
  workspaces: [],
});
const record = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(t('配置格式无效'));
  return value as Record<string, unknown>;
};
function text(value: unknown, max: number, empty = false) {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    value.includes('\0') ||
    (!empty && !value.trim())
  )
    throw Error(t('文本参数无效'));
  return value;
}
function id(value: unknown) {
  const result = text(value, 100);
  if (!/^[a-zA-Z0-9_-]+$/.test(result)) throw Error(t('配置 ID 无效'));
  return result;
}
function list<T>(value: unknown, max: number, validate: (value: unknown) => T & { id: string }) {
  if (!Array.isArray(value) || value.length > max) throw Error(t('配置条目过多或格式无效'));
  const result = value.map(validate);
  if (new Set(result.map((item) => item.id)).size !== result.length) throw Error(t('配置 ID 重复'));
  return result;
}
function expand(body: string, replace: (name: string) => string) {
  return body.replace(/\\\{\{|\{\{([^{}]*)\}\}/g, (match, name: string | undefined) => {
    if (match === '\\{{') return '{{';
    const token = name!.trim();
    if (
      token !== 'clipboard' &&
      token !== 'date' &&
      !/^date:(?:YYYY|MM|DD|HH|mm|ss|[-/: .])+$/u.test(token) &&
      !/^input:[^{}\r\n:]{1,60}$/u.test(token)
    )
      throw Error(t('未知短语变量：{{v0}}', { v0: token }));
    return replace(token);
  });
}
export function snippetVariables(body: string) {
  const names: string[] = [];
  expand(body, (token) => {
    if (token.startsWith('input:')) names.push(token.slice(6));
    return '';
  });
  return [...new Set(names)];
}
export function renderSnippet(
  body: string,
  values: Record<string, string>,
  clipboard: string,
  now = new Date(),
) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const date: Record<string, string> = {
    YYYY: String(now.getFullYear()),
    MM: pad(now.getMonth() + 1),
    DD: pad(now.getDate()),
    HH: pad(now.getHours()),
    mm: pad(now.getMinutes()),
    ss: pad(now.getSeconds()),
  };
  const output = expand(body, (token) => {
    if (token === 'clipboard') return clipboard;
    if (token.startsWith('input:')) {
      const name = token.slice(6);
      if (!Object.hasOwn(values, name)) throw Error(t('请填写变量：{{v0}}', { v0: name }));
      return values[name];
    }
    return (token === 'date' ? 'YYYY-MM-DD' : token.slice(5)).replace(
      /YYYY|MM|DD|HH|mm|ss/g,
      (part) => date[part],
    );
  });
  if (output.length > 500_000) throw Error(t('输入最多 50 万字符'));
  return output;
}
export function validateSnippet(value: unknown): Snippet {
  const raw = record(value);
  const body = text(raw.body, 50_000);
  snippetVariables(body);
  return {
    id: id(raw.id),
    name: text(raw.name, 80).trim(),
    group: text(raw.group ?? '', 60, true).trim(),
    body,
  };
}
export function validateWorkspace(value: unknown): Workspace {
  const raw = record(value);
  return {
    id: id(raw.id),
    name: text(raw.name, 80).trim(),
    items: list(raw.items, 50, (value) => {
      const item = record(value),
        kind = item.kind as WorkspaceItem['kind'];
      if (!['app', 'folder', 'editor', 'terminal', 'url'].includes(kind))
        throw Error(t('工作区项目类型无效'));
      const target = text(item.target, 32767);
      if (kind === 'url') {
        let url: URL;
        try {
          url = new URL(target);
        } catch {
          throw Error(t('链接无效'));
        }
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
          throw Error(t('链接无效'));
      } else if (!/^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(target) || /[\r\n]/.test(target))
        throw Error(t('请输入绝对路径'));
      const program =
        item.program === undefined || item.program === '' ? undefined : text(item.program, 32767);
      if (kind === 'editor' && !program) throw Error(t('请选择编辑器程序'));
      if (program && !/^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(program)) throw Error(t('请输入绝对路径'));
      if (item.args !== undefined && (!Array.isArray(item.args) || item.args.length > 30))
        throw Error(t('程序参数无效'));
      const args =
        item.args === undefined
          ? undefined
          : (item.args as unknown[]).map((arg) => text(arg, 4096, true));
      return {
        id: id(item.id),
        kind,
        target,
        ...(program ? { program } : {}),
        ...(args ? { args } : {}),
      };
    }),
  };
}
export function validateProductivity(value: unknown): ProductivityConfig {
  const raw = record(value);
  if (raw.version !== 1 || !Number.isSafeInteger(raw.revision) || Number(raw.revision) < 0)
    throw Error(t('配置版本无效'));
  return {
    version: 1,
    revision: Number(raw.revision),
    snippets: list(raw.snippets, 500, validateSnippet),
    workspaces: list(raw.workspaces, 100, validateWorkspace),
  };
}
