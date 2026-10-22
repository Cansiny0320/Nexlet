import { formatLocale, t } from '../shared/i18n';
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import type { Command } from '../shared/types';
import { matchesMetadata, type LaunchInput, type SearchResponse } from '../shared/launch';
import { searchCommands } from '../shared/search';
import { calculate } from '../shared/calculator';

interface RegexResult {
  matched: string[];
  timedOut?: boolean;
  cancelled?: boolean;
}
interface RegexWorker {
  worker: Worker;
  idle?: NodeJS.Timeout;
}
export class ContentMatcher {
  private pending = new Map<number, () => void>();
  private workers = new Map<number, RegexWorker>();
  cancel(owner: number) {
    this.pending.get(owner)?.();
  }
  private dispose(owner: number, slot: RegexWorker) {
    clearTimeout(slot.idle);
    if (this.workers.get(owner) === slot) this.workers.delete(owner);
    void slot.worker.terminate();
  }
  forget(owner: number) {
    this.cancel(owner);
    const slot = this.workers.get(owner);
    if (slot) this.dispose(owner, slot);
  }
  close() {
    for (const owner of new Set([...this.pending.keys(), ...this.workers.keys()]))
      this.forget(owner);
  }
  async search(
    owner: number,
    commands: Command[],
    input: LaunchInput,
    query: string,
    recent: string[],
    progress?: (value: SearchResponse) => void,
    preferences: Record<string, number> = {},
  ): Promise<SearchResponse> {
    this.cancel(owner);
    const content = new Set<string>(),
      regex: { id: string; pattern: string; flags?: string }[] = [];
    let capped = false;
    for (const command of commands)
      for (const rule of command.matches || []) {
        if (!matchesMetadata(rule, input)) continue;
        if (rule.type === 'regex') {
          if (regex.length < 128)
            regex.push({ id: command.id, pattern: rule.pattern, flags: rule.flags });
          else capped = true;
        } else content.add(command.id);
      }
    const attach = (c: Command): Command => ({ ...c, inputId: input.id });
    const results =
      input.type === 'text' && query.length <= 1024
        ? searchCommands(commands, query, recent, 60, preferences).map(attach)
        : [];
    const ids = new Set(results.map((c) => c.id)),
      builtins = builtinMatches(input);
    const response = (warning?: string): SearchResponse => {
      const matching = commands.filter((c) => content.has(c.id) && !ids.has(c.id));
      const ordered =
        input.type !== 'text' && query.trim()
          ? searchCommands(matching, query, recent)
          : matching.sort((a, b) => {
              const ai = recent.indexOf(a.id),
                bi = recent.indexOf(b.id);
              return (
                (ai < 0 ? Infinity : ai) - (bi < 0 ? Infinity : bi) ||
                a.name.localeCompare(b.name, formatLocale())
              );
            });
      const matches = ordered.slice(0, 60).map(attach);
      matches.push(
        ...(input.type !== 'text' && query.trim() ? searchCommands(builtins, query) : builtins).map(
          attach,
        ),
      );
      const calculationIndex = matches.findIndex((c) => c.id === 'match:calc');
      if (calculationIndex > 0) matches.unshift(...matches.splice(calculationIndex, 1));
      return { input, results, matches, ...(warning ? { warning } : {}) };
    };
    let warning = capped ? t('内容匹配规则较多，本次仅检查前 128 条正则规则') : undefined;
    if (input.type === 'text' && regex.length) {
      progress?.(response(warning));
      const result = await this.regex(owner, regex, input.text);
      if (result.cancelled) return { input, results: [], matches: [], cancelled: true };
      result.matched.forEach((id) => content.add(id));
      if (result.timedOut) warning = t('部分内容匹配规则超时，已跳过；普通搜索仍可使用');
    }
    return response(warning);
  }
  private regex(
    owner: number,
    rules: { id: string; pattern: string; flags?: string }[],
    text: string,
  ): Promise<RegexResult> {
    return new Promise((resolve) => {
      let slot = this.workers.get(owner);
      if (!slot) {
        slot = {
          worker: new Worker(path.join(__dirname, 'match-worker.cjs'), {
            resourceLimits: { maxOldGenerationSizeMb: 32 },
          }),
        };
        this.workers.set(owner, slot);
        const current = slot;
        // An idle worker may exit too; always retain an error listener.
        slot.worker.on('error', () => {
          if (this.workers.get(owner) === current) this.workers.delete(owner);
          clearTimeout(current.idle);
        });
        slot.worker.on('exit', () => {
          if (this.workers.get(owner) === current) this.workers.delete(owner);
          clearTimeout(current.idle);
        });
      }
      const current = slot,
        worker = slot.worker;
      clearTimeout(slot.idle);
      worker.ref();
      let done = false;
      const message = (value: RegexResult) => finish(value, !value.timedOut);
      const failed = () => finish({ matched: [], timedOut: true });
      const finish = (value: RegexResult, reuse = false) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        worker.removeListener('message', message);
        worker.removeListener('error', failed);
        worker.removeListener('exit', failed);
        if (this.pending.get(owner) === cancel) this.pending.delete(owner);
        if (reuse && this.workers.get(owner) === current) {
          worker.unref();
          current.idle = setTimeout(() => this.dispose(owner, current), 30_000);
          current.idle.unref();
        } else this.dispose(owner, current);
        resolve(value);
      };
      const cancel = () => finish({ matched: [], cancelled: true });
      const timer = setTimeout(failed, 1000);
      this.pending.set(owner, cancel);
      worker.once('message', message);
      worker.once('error', failed);
      worker.once('exit', failed);
      worker.postMessage({ rules, text });
    });
  }
}

function builtinMatches(input: LaunchInput): Command[] {
  const command = (
    id: string,
    name: string,
    subtitle: string,
    color: string,
    payload?: string,
  ): Command => ({ id, name, subtitle, color, kind: 'match', keywords: [], payload });
  if (input.type !== 'text')
    return [command('match:collect', t('收进剪贴板'), t('将本次输入保存到剪贴板历史'), '#6962ff')];
  const q = input.text.trim();
  if (!q) return [];
  const output: Command[] = [];
  if (q.length <= 512) {
    const calc = calculate(q);
    if (calc.result)
      output.push(
        command(
          'match:calc',
          t('计算稿纸'),
          t('{{v0}} = {{v1}} · 打开计算稿纸', { v0: q, v1: calc.result }),
          '#ff9c00',
          input.text,
        ),
      );
  }
  if (q.length <= 2048 && /^https?:\/\//i.test(q))
    output.push(command('input:url', t('打开链接'), q, '#3387f7', q));
  if (/^[{[]/.test(q))
    output.push(
      command('match:json', t('JSON 格式化'), t('将输入内容带入 JSON 工具'), '#42a869', input.text),
    );
  if (/^\d{10}(?:\d{3})?$/.test(q)) {
    const date = new Date(Number(q) * (q.length === 10 ? 1000 : 1));
    if (!Number.isNaN(date.getTime()))
      output.push(
        command(
          'match:timestamp',
          date.toLocaleString(formatLocale(), { hour12: false }),
          t('{{v0}} · 打开时间戳工具', { v0: q }),
          '#ef6863',
          q,
        ),
      );
  }
  output.push(
    command(
      'match:clipboard',
      t('剪贴板搜索'),
      t('在剪贴板历史中搜索当前内容'),
      '#6962ff',
      input.text,
    ),
  );
  return output;
}
