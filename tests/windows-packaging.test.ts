import { expect, it, vi } from 'vite-plus/test';
import path from 'node:path';
import { Arch, Platform } from 'electron-builder';
// @ts-expect-error Build-time JavaScript helper is exercised directly.
import { packageWindows } from '../scripts/package-windows.mjs';

it('builds NSIS and portable independently so portable compression cannot enter the update installer', async () => {
  const build = vi.fn().mockResolvedValue([]);
  await packageWindows({ output: '.tmp/windows package', build });
  expect(build).toHaveBeenCalledTimes(2);
  const [installer, portable] = build.mock.calls.map(([options]) => options);
  expect(installer.targets.get(Platform.WINDOWS).get(Arch.x64)).toEqual(['nsis']);
  expect(installer.config.nsis.differentialPackage).toBe(true);
  expect(installer.prepackaged).toBeUndefined();
  expect(portable.targets.get(Platform.WINDOWS).get(Arch.x64)).toEqual(['portable']);
  expect(portable.prepackaged).toBe(path.resolve('.tmp/windows package/win-unpacked'));
  expect(installer.publish).toBe('never');
  expect(portable.publish).toBe('never');
});

it('does not reuse an old unpacked app when the installer build fails', async () => {
  const build = vi.fn().mockRejectedValue(new Error('packaging failed'));
  await expect(packageWindows({ build })).rejects.toThrow('packaging failed');
  expect(build).toHaveBeenCalledTimes(1);
});
