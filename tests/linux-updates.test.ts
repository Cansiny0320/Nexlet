import { expect, it } from 'vite-plus/test';
import { portableRelease } from '../src/main/updater';
it('Linux 手动升级仅选择当前架构的 deb，保持 Windows 便携包选择', () => {
  const release = {
    tag_name: 'v1.0.0',
    draft: false,
    prerelease: false,
    assets: [
      'Nexlet-1.0.0-Linux-arm64.deb',
      'Nexlet-1.0.0-Linux-x64.AppImage',
      'Nexlet-1.0.0-Windows-x64.exe',
    ].map((name) => ({ name })),
  };
  expect(portableRelease(release, '0.2.11', 'linux', 'arm64')?.url).toContain('Linux-arm64.deb');
  expect(portableRelease(release, '0.2.11', 'linux', 'x64')).toBeNull();
  expect(portableRelease(release, '0.2.11')?.url).toContain('Windows-x64.exe');
  expect(portableRelease(release, '0.2.11', 'linux', 'ia32')).toBeNull();
});

it('x64 更新匹配 electron-builder 实际生成的 amd64 deb 文件名', () => {
  const release = {
    tag_name: 'v1.0.0',
    draft: false,
    prerelease: false,
    assets: [{ name: 'Nexlet-1.0.0-Linux-amd64.deb' }],
  };
  expect(portableRelease(release, '0.2.11', 'linux', 'x64')?.url).toContain('Linux-amd64.deb');
});
