import { afterEach, expect, it } from 'vite-plus/test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
// @ts-expect-error Build-time JavaScript helper is exercised directly.
import { linuxArchitectures, verifyLinuxBinary } from '../scripts/package-linux.mjs';
const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});
it('默认打包两种架构，也允许原生 CI 只构建单架构', () => {
  expect(linuxArchitectures([])).toEqual(['x64', 'arm64']);
  expect(linuxArchitectures(['--arch', 'arm64'])).toEqual(['arm64']);
  expect(() => linuxArchitectures(['--arch', 'ia32'])).toThrow('Usage');
});
it('产物验证拒绝跨架构混入的 native binary', () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'nexlet-elf-'));
  folders.push(folder);
  const file = path.join(folder, 'koffi.node'),
    bytes = Buffer.alloc(24);
  Buffer.from('7f454c46', 'hex').copy(bytes);
  bytes[4] = 2;
  bytes[5] = 1;
  bytes.writeUInt16LE(183, 18);
  writeFileSync(file, bytes);
  expect(() => verifyLinuxBinary(file, 'arm64')).not.toThrow();
  expect(() => verifyLinuxBinary(file, 'x64')).toThrow('architecture');
  writeFileSync(file, 'not ELF');
  expect(() => verifyLinuxBinary(file, 'arm64')).toThrow('architecture');
});
