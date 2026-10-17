import { describe, expect, it } from 'vite-plus/test';
import { formatJson, normalizeJson, parseJson } from '../src/shared/json-tools';

describe('JSON 格式化与结构对比', () => {
  it('格式化和压缩保留大整数及原始数字精度', () => {
    const source = '{"id":900719925474099312345,"ratio":1.23000000000000000001}';
    expect(formatJson(source)).toBe(
      '{\n  "id": 900719925474099312345,\n  "ratio": 1.23000000000000000001\n}',
    );
    expect(formatJson(formatJson(source), true)).toBe(source);
  });
  it('默认归一化对象键顺序，同时保留数组顺序', () => {
    expect(normalizeJson('{"b":2,"a":1}', true)).toBe(normalizeJson('{"a":1,"b":2}', true));
    expect(normalizeJson('[1,2]', true)).not.toBe(normalizeJson('[2,1]', true));
    expect(normalizeJson('{"b":2,"a":1}', false)).not.toBe(normalizeJson('{"a":1,"b":2}', false));
  });
  it('字符串转义和相等数字不产生语义差异', () => {
    expect(normalizeJson('{"x":"\\u0061","n":1.0}', true)).toBe(
      normalizeJson('{"x":"a","n":1}', true),
    );
  });
  it('拒绝非法 JSON、注释和尾逗号，并显示错误位置', () => {
    for (const source of ['{bad}', '{"a":1,}', '{/* comment */"a":1}', '[undefined]'])
      expect(() => parseJson(source)).toThrow(/第 \d+ 行/);
  });
  it('限制超深和超长输入，保留特殊键为普通数据', () => {
    expect(() => parseJson('['.repeat(65) + '0' + ']'.repeat(65))).toThrow('嵌套');
    expect(() => parseJson(' '.repeat(500001))).toThrow('500 KB');
    expect(formatJson('{"__proto__":{"safe":true}}', true)).toBe('{"__proto__":{"safe":true}}');
  });
});
