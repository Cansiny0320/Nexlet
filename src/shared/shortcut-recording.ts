type ShortcutKeyEvent = Pick<KeyboardEvent, 'key' | 'code' | 'altKey'>;

export function recordedShortcutKey(event: ShortcutKeyEvent, platform: string): string {
  // On macOS, Option changes `key` to a symbol or Dead. Record the base key
  // from `code` instead; keep other platforms and ordinary layout-aware input unchanged.
  if (platform === 'darwin' && event.altKey) {
    if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3);
    if (/^Digit[0-9]$/.test(event.code)) return event.code.slice(5);
    const punctuation: Record<string, string> = {
      Backquote: '`',
      Minus: '-',
      Equal: '=',
      BracketLeft: '[',
      BracketRight: ']',
      Backslash: '\\',
      Semicolon: ';',
      Quote: "'",
      Comma: ',',
      Period: '.',
      Slash: '/',
    };
    if (punctuation[event.code]) return punctuation[event.code];
  }
  return event.code === 'Space'
    ? 'Space'
    : event.key.length === 1
      ? event.key.toUpperCase()
      : event.key;
}
