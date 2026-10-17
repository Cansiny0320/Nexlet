import { expect, it, vi } from 'vite-plus/test';
import { ClipboardGuard } from '../src/main/plugin-sdk/clipboard-guard';

it('binds snapshots to one caller, consumes tokens and refuses changed clipboard data', async () => {
  let current = 'first';
  const write = vi.fn();
  const guard = new ClipboardGuard(async () => current, write);
  const token = await guard.snapshot(1);
  expect(await guard.write(2, token!, 'wrong caller')).toBe(false);
  current = 'new clipboard';
  expect(await guard.write(1, token!, 'old OCR')).toBe(false);
  const next = await guard.snapshot(1);
  expect(await guard.write(1, next!, 'text')).toBe(true);
  expect(await guard.write(1, next!, 'replay')).toBe(false);
  expect(write).toHaveBeenCalledExactlyOnceWith('text');
});

it('invalidates snapshots on session close and rejects an in-flight stale snapshot', async () => {
  let resolve!: (value: string) => void;
  const guard = new ClipboardGuard(
    () =>
      new Promise<string>((r) => {
        resolve = r;
      }),
    vi.fn(),
  );
  const pending = guard.snapshot(1);
  guard.close(1);
  resolve('stamp');
  expect(await pending).toBeNull();
});
