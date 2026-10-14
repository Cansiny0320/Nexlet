import { test } from 'vitest';
import assert from 'node:assert/strict';
import { selectPlatform, getShortcutModifier } from '../src/lib/platform';

test('Windows x64 browser selects the Windows artifact', () => {
  assert.equal(
    selectPlatform({ platform: 'Windows', architecture: 'x86', bitness: '64' }),
    'windows-x64',
  );
  assert.equal(
    selectPlatform({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }),
    'windows-x64',
  );
});
test('a known macOS architecture selects the matching artifact', () => {
  assert.equal(
    selectPlatform({ platform: 'macOS', architecture: 'arm', bitness: '64' }),
    'macos-arm64',
  );
  assert.equal(
    selectPlatform({ platform: 'macOS', architecture: 'x86', bitness: '64' }),
    'macos-x64',
  );
});
test('macOS Intel UA is not enough to infer hardware architecture', () => {
  assert.equal(
    selectPlatform({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      platform: 'MacIntel',
    }),
    null,
  );
});
test('mobile, unknown, Windows ARM and 32-bit devices require manual selection', () => {
  for (const input of [
    {},
    { platform: 'Linux' },
    { platform: 'Windows', architecture: 'arm', bitness: '64' },
    { platform: 'Windows', architecture: 'x86', bitness: '32' },
    { platform: 'macOS', mobile: true },
    { platform: 'MacIntel', maxTouchPoints: 5 },
    { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' },
  ])
    assert.equal(selectPlatform(input), null);
});
test('macOS shortcut uses Option without needing architecture detection', () => {
  for (const input of [
    { platform: 'macOS' },
    { platform: 'MacIntel' },
    { platform: 'MacARM' },
    { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
  ])
    assert.equal(getShortcutModifier(input), 'Option');
});
test('other platforms keep Alt and iPad desktop mode is not treated as macOS', () => {
  for (const input of [
    {},
    { platform: 'Windows' },
    { platform: 'Win32' },
    { platform: 'Linux' },
    { platform: 'macOS', mobile: true },
    { platform: 'MacIntel', maxTouchPoints: 5 },
    { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' },
  ])
    assert.equal(getShortcutModifier(input), 'Alt');
});
