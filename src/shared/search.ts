import { pinyin } from 'pinyin-pro';
import type { Command } from './types';

const cache = new Map<string, string[]>();
function terms(command: Command): string[] {
  const key = command.name + '\0' + command.keywords.join('\0');
  const found = cache.get(key); if (found) return found;
  const result = [...new Set([command.name, ...command.keywords].flatMap(value => {
    const normalized = value.toLowerCase();
    const variants = [normalized, normalized.replace(/\s/g, '')];
    if (/\p{Script=Han}/u.test(value)) {
      variants.push(pinyin(value, { toneType: 'none', type: 'array' }).join('').toLowerCase().replace(/\s/g, ''));
      variants.push(pinyin(value, { pattern: 'first', type: 'array' }).join('').toLowerCase().replace(/\s/g, ''));
    }
    return variants;
  }))];
  if (cache.size > 10_000) cache.clear();
  cache.set(key, result); return result;
}
export function searchCommands(commands: Command[], query: string, recent: string[] = [], limit = 60): Command[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return commands.map(command => {
    const variants = terms(command);
    let score = 0;
    for (const word of words) {
      const current = Math.max(...variants.map((value, i) => value === word ? 1000 - Math.min(i, 8) * 20 : value.startsWith(word) ? 800 - Math.min(i, 8) * 20 : value.includes(word) ? 400 - Math.min(i, 8) * 10 : 0));
      if (current <= 0) return { command, score: 0 };
      score += current;
    }
    const position = recent.indexOf(command.id);
    return { command, score: score + (position >= 0 ? Math.max(0, 20 - position) : 0) };
  }).filter(v => v.score > 0).sort((a, b) => b.score - a.score || a.command.name.localeCompare(b.command.name, 'zh-CN')).slice(0, limit).map(v => v.command);
}
