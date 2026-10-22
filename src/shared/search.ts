import { formatLocale } from './i18n';
import { pinyin } from 'pinyin-pro';
import type { Command } from './types';

const cache = new Map<string, string[]>();
function terms(command: Command): string[] {
  const key = command.name + '\0' + command.keywords.join('\0');
  const found = cache.get(key);
  if (found) return found;
  const result = [
    ...new Set(
      [command.name, ...command.keywords].flatMap((value) => {
        const normalized = value.toLowerCase();
        const variants = [normalized, normalized.replace(/\s/g, '')];
        if (/\p{Script=Han}/u.test(value)) {
          variants.push(
            pinyin(value, { toneType: 'none', type: 'array' })
              .join('')
              .toLowerCase()
              .replace(/\s/g, ''),
          );
          variants.push(
            pinyin(value, { pattern: 'first', type: 'array' })
              .join('')
              .toLowerCase()
              .replace(/\s/g, ''),
          );
        }
        return variants;
      }),
    ),
  ];
  if (cache.size > 10_000) cache.clear();
  cache.set(key, result);
  return result;
}
/** One edit or adjacent transposition, only for longer Latin tokens. */
function near(word: string, value: string): boolean {
  if (
    !/^[a-z]{4,32}$/.test(word) ||
    !/^[a-z]{4,32}$/.test(value) ||
    Math.abs(word.length - value.length) > 1 ||
    word[0] !== value[0]
  )
    return false;
  let i = 0,
    j = 0,
    edits = 0;
  while (i < word.length && j < value.length) {
    if (word[i] === value[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (word.length === value.length) {
      if (word[i] === value[j + 1] && word[i + 1] === value[j]) {
        i += 2;
        j += 2;
      } else {
        i++;
        j++;
      }
    } else if (word.length > value.length) i++;
    else j++;
  }
  return edits + Number(i < word.length || j < value.length) <= 1;
}
export function searchCommands(
  commands: Command[],
  query: string,
  recent: string[] = [],
  limit = 60,
  preferences: Record<string, number> = {},
): Command[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return commands
    .map((command) => {
      const variants = terms(command);
      let score = 0,
        tier = 3;
      for (const word of words) {
        const matches = variants
          .map((value, i) => {
            const category =
              value === word
                ? 3
                : value.startsWith(word)
                  ? 2
                  : value.includes(word)
                    ? 1
                    : value.split(/\s+/).some((token) => near(word, token))
                      ? 0
                      : -1;
            return {
              tier: category,
              score: category < 0 ? 0 : (category + 1) * 300 - Math.min(i, 8) * 10,
            };
          })
          .sort((a, b) => b.tier - a.tier || b.score - a.score);
        const best = matches[0];
        if (!best || best.tier < 0) return { command, score: 0, tier: -1 };
        tier = Math.min(tier, best.tier);
        score += best.score;
      }
      const position = recent.indexOf(command.id);
      return {
        command,
        tier,
        score:
          score +
          (position >= 0 ? Math.max(0, 20 - position) : 0) +
          Math.min(80, Math.max(0, preferences[command.id] || 0)),
      };
    })
    .filter((item) => item.tier >= 0)
    .sort(
      (a, b) =>
        b.tier - a.tier ||
        b.score - a.score ||
        a.command.name.localeCompare(b.command.name, formatLocale()),
    )
    .slice(0, limit)
    .map((item) => item.command);
}
export function highlightRanges(value: string, query: string): [number, number][] {
  const normalized = value.toLowerCase(),
    ranges: [number, number][] = [];
  for (const word of query.trim().toLowerCase().split(/\s+/).filter(Boolean)) {
    let start = normalized.indexOf(word);
    while (start >= 0) {
      ranges.push([start, start + word.length]);
      start = normalized.indexOf(word, start + word.length);
    }
  }
  if (!ranges.length && query.trim()) {
    const compact = query.trim().toLowerCase();
    if (/\p{Script=Han}/u.test(value)) {
      const full = pinyin(value, { toneType: 'none', type: 'array' }).join('').toLowerCase();
      const initials = pinyin(value, { pattern: 'first', type: 'array' }).join('').toLowerCase();
      if (full.includes(compact) || initials.includes(compact)) return [[0, value.length]];
    }
    if (normalized.split(/\s+/).some((word) => near(compact, word))) return [[0, value.length]];
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push(range);
  }
  return merged;
}
