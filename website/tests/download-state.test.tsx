import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SiteProvider, useSite } from '../src/components/site-provider';
import { fallbackRelease } from '../src/lib/releases';

afterEach(cleanup);
function Probe() {
  const state = useSite();
  return (
    <>
      <button onClick={() => state.choose('macos-x64')}>Intel</button>
      <output data-testid="selection">{state.selected ?? 'unknown'}</output>
      <output data-testid="version">{state.release.version}</output>
      <output data-testid="url">
        {state.selected ? state.release.platforms[state.selected] : '/download/'}
      </output>
      <output data-testid="status">{state.status}</output>
    </>
  );
}

test('a manual choice wins over late hardware detection and remains selected after release refresh', async () => {
  let resolveHardware!: (info: { architecture: string; bitness: string }) => void;
  Object.defineProperty(navigator, 'userAgentData', {
    configurable: true,
    value: {
      platform: 'macOS',
      mobile: false,
      getHighEntropyValues: () =>
        new Promise((resolve) => {
          resolveHardware = resolve;
        }),
    },
  });
  let resolveRelease!: (release: typeof fallbackRelease) => void;
  const loadRelease = vi.fn(
    () =>
      new Promise<typeof fallbackRelease>((resolve) => {
        resolveRelease = resolve;
      }),
  );
  render(
    <SiteProvider path="/" loadRelease={loadRelease}>
      <Probe />
      <Probe />
    </SiteProvider>,
  );
  fireEvent.click(screen.getAllByText('Intel')[0]);
  await act(async () => {
    resolveHardware({ architecture: 'arm', bitness: '64' });
    resolveRelease({
      ...fallbackRelease,
      version: '9.9.9',
      platforms: { ...fallbackRelease.platforms, 'macos-x64': 'https://example.test/intel.dmg' },
    });
  });
  expect(screen.getAllByTestId('selection').map((el) => el.textContent)).toEqual([
    'macos-x64',
    'macos-x64',
  ]);
  expect(screen.getAllByTestId('url')[0].textContent).toBe('https://example.test/intel.dmg');
  expect(loadRelease).toHaveBeenCalledTimes(1);
});

test('failed release lookup preserves the complete fallback', async () => {
  Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: undefined });
  render(
    <SiteProvider path="/download/" loadRelease={() => Promise.reject(new Error('offline'))}>
      <Probe />
    </SiteProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('failed'));
  expect(screen.getByTestId('version').textContent).toBe(fallbackRelease.version);
  fireEvent.click(screen.getByText('Intel'));
  expect(screen.getByTestId('url').textContent).toBe(fallbackRelease.platforms['macos-x64']);
});

test('plugin page does not request release data', () => {
  const loadRelease = vi.fn();
  render(
    <SiteProvider path="/plugins/" loadRelease={loadRelease}>
      <Probe />
    </SiteProvider>,
  );
  expect(loadRelease).not.toHaveBeenCalled();
});
