import { expect, it } from 'vite-plus/test';
// @ts-expect-error Build-time JavaScript helper is exercised directly.
import { lockedPackage } from '../scripts/locked-package.mjs';

it('selects the exact native package and preserves its integrity', () => {
  const lock = `packages:\n  '@koromix/koffi-linux-arm64@3.3.3':\n    resolution: {integrity: sha512-fixture}\n`;
  expect(lockedPackage(lock, '@koromix/koffi-linux-arm64', '3.3.3')).toEqual({
    integrity: 'sha512-fixture',
    tarball: 'https://registry.npmjs.org/@koromix/koffi-linux-arm64/-/koffi-linux-arm64-3.3.3.tgz',
  });
  expect(() => lockedPackage(lock, '@koromix/koffi-linux-x64', '3.3.3')).toThrow('Missing locked');
  expect(() => lockedPackage(lock, '@koromix/koffi-linux-arm64', '3.3.4')).toThrow(
    'Missing locked',
  );
});

it('rejects missing integrity and insecure archive locations', () => {
  expect(() => lockedPackage('packages: {native@1: {resolution: {}}}', 'native', '1')).toThrow(
    'Missing locked',
  );
  expect(() =>
    lockedPackage(
      'packages: {native@1: {resolution: {integrity: sha512-fixture, tarball: "http://example.com/native.tgz"}}}',
      'native',
      '1',
    ),
  ).toThrow('HTTPS');
});
