import { expect, it } from 'vite-plus/test';
import { recordedShortcutKey } from '../src/shared/shortcut-recording';

it.each([
  ['∆', 'KeyJ', 'J'],
  ['Δ', 'KeyJ', 'J'],
  ['å', 'KeyA', 'A'],
  ['Dead', 'KeyE', 'E'],
  ['€', 'Digit2', '2'],
  ['≠', 'Equal', '='],
  ['–', 'Minus', '-'],
  ['“', 'BracketLeft', '['],
  ['‘', 'BracketRight', ']'],
  ['«', 'Backslash', '\\'],
  ['…', 'Semicolon', ';'],
  ['æ', 'Quote', "'"],
  ['≤', 'Comma', ','],
  ['≥', 'Period', '.'],
  ['÷', 'Slash', '/'],
  ['Dead', 'Backquote', '`'],
])('records the base key for macOS Option output %s (%s)', (key, code, expected) => {
  expect(recordedShortcutKey({ key, code, altKey: true }, 'darwin')).toBe(expected);
});

it.each(['darwin', 'win32', 'linux'])('preserves ordinary keys and layout on %s', (platform) => {
  for (const [key, code, expected] of [
    ['a', 'KeyA', 'A'],
    ['z', 'KeyY', 'Z'],
    [' ', 'Space', 'Space'],
    ['F12', 'F12', 'F12'],
    ['ArrowLeft', 'ArrowLeft', 'ArrowLeft'],
  ]) {
    expect(recordedShortcutKey({ key, code, altKey: false }, platform)).toBe(expected);
  }
  expect(recordedShortcutKey({ key: 'F12', code: 'F12', altKey: true }, platform)).toBe('F12');
  expect(recordedShortcutKey({ key: 'j', code: '', altKey: true }, platform)).toBe('J');
});

it.each(['win32', 'linux'])('keeps Alt shortcut layout semantics on %s', (platform) => {
  expect(recordedShortcutKey({ key: 'z', code: 'KeyY', altKey: true }, platform)).toBe('Z');
});
