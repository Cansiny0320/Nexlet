import { expect, it } from 'vitest';
import { formatShortcut, parseShortcutInput } from '../src/shared/shortcut-display';
import { normalizeAccelerator } from '../src/main/shortcut-manager';

it.each([
  ['darwin', 'Control+Alt+Space', 'Control+Option+Space'],
  ['win32', 'Control+Alt+Space', 'Ctrl+Alt+Space'],
  ['linux', 'Control+Alt+Space', 'Ctrl+Alt+Space'],
  ['darwin', 'CmdOrCtrl+Shift+J', 'Command+Shift+J'],
  ['win32', 'CommandOrControl+Shift+J', 'Ctrl+Shift+J'],
  ['linux', 'CommandOrControl+Shift+J', 'Ctrl+Shift+J'],
  ['win32', 'Super+J', 'Win+J'],
  ['linux', 'Super+J', 'Super+J'],
  ['darwin', 'cmd+option+J', 'Command+Option+J'],
])('displays %s shortcuts and preserves the registered keys', (platform, raw, display) => {
  expect(formatShortcut(raw, platform)).toBe(display);
  expect(normalizeAccelerator(parseShortcutInput(display), platform)).toBe(normalizeAccelerator(raw, platform));
});

it('preserves empty values, function keys and unfinished edits for existing validation', () => {
  for (const value of ['', 'F12', 'Control+', 'AudioVolumeUp']) {
    expect(parseShortcutInput(value)).toBe(value);
  }
  expect(formatShortcut('', 'darwin')).toBe('');
  expect(formatShortcut('Control+Plus', 'win32')).toBe('Ctrl+Plus');
});
