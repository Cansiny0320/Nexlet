import { createScanner, parseTree, SyntaxKind, type Node, type ParseError } from 'jsonc-parser';
import Decimal from 'decimal.js';

export type JsonNode = Node;
export const JSON_LIMIT = 500_000;
export function parseJson(source: string): Node {
  if (source.length > JSON_LIMIT) throw Error('JSON 超过 500 KB，请缩小内容后再处理');
  const scanner = createScanner(source, true);
  let depth = 0, tokens = 0, token: SyntaxKind;
  while ((token = scanner.scan()) !== SyntaxKind.EOF) {
    if (++tokens > 60_000) throw Error('JSON 字段过多，请缩小内容后再处理');
    if (token === SyntaxKind.OpenBraceToken || token === SyntaxKind.OpenBracketToken) {
      if (++depth > 64) throw Error('JSON 嵌套不能超过 64 层');
    } else if (token === SyntaxKind.CloseBraceToken || token === SyntaxKind.CloseBracketToken) depth--;
  }
  const errors: ParseError[] = [];
  const root = parseTree(source, errors, { disallowComments: true, allowTrailingComma: false, allowEmptyContent: false });
  if (errors.length || !root) {
    const offset = errors[0]?.offset || 0;
    const lines = source.slice(0, offset).split('\n');
    throw Error(`JSON 格式错误：第 ${lines.length} 行，第 ${lines.at(-1)!.length + 1} 列`);
  }
  return root;
}

function serialize(node: Node, source: string, compact: boolean, sorted: boolean, canonical: boolean, depth = 0): string {
  const raw = source.slice(node.offset, node.offset + node.length);
  if (node.type === 'number') return canonical ? new Decimal(raw).toString() : raw;
  if (node.type === 'string') return canonical ? JSON.stringify(node.value) : raw;
  if (node.type !== 'array' && node.type !== 'object') return raw;
  let children = node.children || [];
  const object = node.type === 'object';
  if (object && sorted) children = [...children].sort((a, b) => { const x = a.children![0].value, y = b.children![0].value; return x < y ? -1 : x > y ? 1 : 0; });
  const open = object ? '{' : '[', close = object ? '}' : ']';
  if (!children.length) return open + close;
  const space = compact ? '' : ' ', indent = compact ? '' : '  '.repeat(depth + 1);
  const entries = children.map(child => {
    if (!object) return serialize(child, source, compact, sorted, canonical, depth + 1);
    const [key, value] = child.children!;
    return serialize(key, source, compact, sorted, canonical, depth + 1) + ':' + space + serialize(value, source, compact, sorted, canonical, depth + 1);
  });
  return compact ? open + entries.join(',') + close : `${open}\n${indent}${entries.join(',\n' + indent)}\n${'  '.repeat(depth)}${close}`;
}

export function formatJson(source: string, compact = false): string {
  return serialize(parseJson(source), source, compact, false, false);
}
export function normalizeJson(source: string, ignoreObjectOrder: boolean): string {
  return serialize(parseJson(source), source, false, ignoreObjectOrder, true);
}
