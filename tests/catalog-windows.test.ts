import { beforeEach, expect, it, vi } from 'vite-plus/test';

const { exec } = vi.hoisted(() => ({ exec: vi.fn() }));
vi.mock('node:util', () => ({ promisify: () => exec }));
import { readWindowsApplicationSignature } from '../src/main/catalog-windows';

beforeEach(() => exec.mockReset());

it('compares registered applications independently of order, excluding desktop shortcuts', async () => {
  const apps = [
    { Name: 'B', AppID: 'PackageB!App' },
    { Name: 'A', AppID: 'PackageA!App' },
    { Name: 'Shortcut', AppID: 'File shortcut' },
  ];
  exec
    .mockResolvedValueOnce({ stdout: JSON.stringify(apps) })
    .mockResolvedValueOnce({ stdout: JSON.stringify([...apps].reverse()) });
  expect(await readWindowsApplicationSignature()).toBe(await readWindowsApplicationSignature());
  expect(exec.mock.calls[0][1][3]).not.toContain('Get-AppxPackage');
});

it('handles empty/single results and distinguishes registration changes from read failures', async () => {
  exec
    .mockResolvedValueOnce({ stdout: '' })
    .mockResolvedValueOnce({ stdout: '{"Name":"应用","AppID":"Package!App"}' })
    .mockRejectedValueOnce(Error('unavailable'));
  expect(await readWindowsApplicationSignature()).toBe('[]');
  expect(await readWindowsApplicationSignature()).toBe('[["Package!App","应用"]]');
  await expect(readWindowsApplicationSignature()).rejects.toThrow('unavailable');
});
