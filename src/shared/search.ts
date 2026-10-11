import { pinyin } from 'pinyin-pro';
import type { Command } from './types';

const cache = new Map<string, string[]>();
function terms(command: Command): string[] {
  const key = command.name + '\0' + command.keywords.join('\0');
  const found = cache.get(key); if (found) return found;
  const name = command.name.toLowerCase().replace(/\s/g, '');
  const full = pinyin(command.name, { toneType: 'none', type: 'array' }).join('').toLowerCase();
  const initials = pinyin(command.name, { pattern: 'first', toneType: 'none', type: 'array' }).join('').toLowerCase();
  const result = [name, full, initials, ...command.keywords.map(v => v.toLowerCase())];
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
      const current = Math.max(...variants.map((value, i) => value === word ? 1000 - i * 40 : value.startsWith(word) ? 800 - i * 40 : value.includes(word) ? 400 - i * 20 : 0));
      if (current <= 0) return { command, score: 0 };
      score += current;
    }
    const position = recent.indexOf(command.id);
    return { command, score: score + (position >= 0 ? Math.max(0, 20 - position) : 0) };
  }).filter(v => v.score > 0).sort((a, b) => b.score - a.score || a.command.name.localeCompare(b.command.name, 'zh-CN')).slice(0, limit).map(v => v.command);
}
