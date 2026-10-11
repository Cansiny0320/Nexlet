import Decimal from 'decimal.js';

const D = Decimal.clone({ precision: 40, maxE: 1001, minE: -1001 });
export interface Calculation { result?: string; error?: string; }
type Token = { kind: 'number' | 'name' | 'symbol'; value: string };

/** A bounded arithmetic grammar. No eval, property access, assignment or user-defined functions. */
export function calculate(source: string): Calculation {
  const input = source.trim().replaceAll('×', '*').replaceAll('÷', '/').replaceAll('−', '-').replaceAll('π', 'pi');
  if (!input) return { result: '' };
  if (input.length > 512) return { error: '公式过长（最多 512 个字符）' };
  try {
    const tokens: Token[] = [];
    let cursor = 0;
    while (cursor < input.length) {
      const tail = input.slice(cursor);
      const match = /^(\s+|(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[a-zA-Z]+|[+\-*/^%(),])/i.exec(tail);
      if (!match) throw new Error('公式包含不支持的字符');
      const value = match[0]; cursor += value.length;
      if (/^\s/.test(value)) continue;
      tokens.push({ kind: /^[\d.]/.test(value) ? 'number' : /^[a-z]/i.test(value) ? 'name' : 'symbol', value: value.toLowerCase() });
      if (tokens.length > 160) throw new Error('公式过于复杂');
    }
    let index = 0;
    const peek = () => tokens[index]?.value;
    const expect = (value: string) => { if (peek() !== value) throw new Error(`缺少 ${value}`); index++; };
    const bounded = (v: Decimal): Decimal => {
      if (!v.isFinite() || v.isNaN()) throw new Error('结果无效，请检查除数和函数范围');
      if (Math.abs(v.e) > 1000) throw new Error('结果超出可计算范围');
      return v;
    };
    const expression = (minPrecedence = 0, depth = 0): Decimal => {
      if (depth > 32) throw new Error('括号嵌套过深');
      const token = tokens[index++];
      if (!token) throw new Error('公式尚未完成');
      let left: Decimal;
      if (token.kind === 'number') left = bounded(new D(token.value));
      else if (token.value === '+' || token.value === '-') {
        left = expression(30, depth + 1);
        if (token.value === '-') left = left.negated();
      } else if (token.value === '(') {
        left = expression(0, depth + 1); expect(')');
      } else if (token.kind === 'name') {
        if (token.value === 'pi') left = new D('3.141592653589793238462643383279502884197');
        else if (token.value === 'e') left = new D('2.718281828459045235360287471352662497757');
        else {
          expect('(');
          const args = [expression(0, depth + 1)];
          while (peek() === ',') { index++; args.push(expression(0, depth + 1)); if (args.length > 8) throw new Error('函数参数过多'); }
          expect(')');
          const x = args[0];
          if (token.value !== 'min' && token.value !== 'max' && args.length !== 1) throw new Error('函数需要一个参数');
          switch (token.value) {
            case 'sqrt': left = x.sqrt(); break;
            case 'abs': left = x.abs(); break;
            case 'sin': left = x.sin(); break;
            case 'cos': left = x.cos(); break;
            case 'tan': left = x.tan(); break;
            case 'ln': left = x.ln(); break;
            case 'log': left = x.log(10); break;
            case 'round': left = x.round(); break;
            case 'floor': left = x.floor(); break;
            case 'ceil': left = x.ceil(); break;
            case 'min': left = D.min(...args); break;
            case 'max': left = D.max(...args); break;
            default: throw new Error(`不支持函数 ${token.value}`);
          }
          left = bounded(left);
        }
      } else throw new Error('公式格式有误');
      for (;;) {
        const operator = peek();
        if (operator === '%' && 40 >= minPrecedence) { index++; left = left.div(100); continue; }
        const precedence = operator === '+' || operator === '-' ? 10 : operator === '*' || operator === '/' ? 20 : operator === '^' ? 30 : -1;
        if (precedence < minPrecedence) break;
        index++;
        const right = expression(precedence + (operator === '^' ? 0 : 1), depth + 1);
        switch (operator) {
          case '+': left = left.plus(right); break;
          case '-': left = left.minus(right); break;
          case '*': left = left.times(right); break;
          case '/': if (right.isZero()) throw new Error('不能除以零'); left = left.div(right); break;
          case '^': if (right.abs().gt(1000)) throw new Error('指数不能超过 ±1000'); left = left.pow(right); break;
        }
        left = bounded(left);
      }
      return left;
    };
    const result = bounded(expression());
    if (index !== tokens.length) throw new Error('请检查运算符或括号');
    return { result: result.toSignificantDigits(24).toString() };
  } catch (error) { return { error: error instanceof Error ? error.message : '无法计算' }; }
}
