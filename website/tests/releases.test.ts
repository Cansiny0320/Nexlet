import { test } from 'vitest';
import assert from 'node:assert/strict';
import { parseRelease, fetchLatestRelease, RELEASE_API } from '../src/lib/releases';

import { releaseFixture } from './release-fixture';

test('selects the portable EXE, both DMGs and checksums from one published release', () => {
  const release = parseRelease(releaseFixture());
  assert.equal(release.version, '9.9.9');
  assert.match(release.platforms['windows-x64'], /Nexlet-9\.9\.9-Windows-x64\.exe$/);
  assert.match(release.platforms['macos-arm64'], /macOS-arm64\.dmg$/);
  assert.match(release.platforms['macos-x64'], /macOS-x64\.dmg$/);
  assert.match(release.checksumsUrl, /v9\.9\.9\/SHA256SUMS.txt$/);
  assert.match(release.releaseUrl, /tag\/v9\.9\.9$/);
});

test('rejects drafts, prereleases, unpublished and malformed data', () => {
  for (const patch of [
    { draft: true },
    { prerelease: true },
    { published_at: null },
    { assets: null },
    { tag_name: '../other' },
  ]) {
    assert.throws(() => parseRelease({ ...releaseFixture(), ...patch }));
  }
});

test('rejects missing or unfinished assets rather than mixing versions', () => {
  for (let index = 1; index < 5; index++) {
    const missing = releaseFixture();
    missing.assets.splice(index, 1);
    assert.throws(() => parseRelease(missing));
    const unfinished = releaseFixture();
    unfinished.assets[index].state = 'new';
    assert.throws(() => parseRelease(unfinished));
  }
});

test('rejects URLs from another repository, version or origin', () => {
  for (const url of [
    'javascript:alert(1)',
    'https://example.com/Nexlet.exe',
    'https://github.com/Cansiny0320/Nexlet/releases/download/v0.1.0/Nexlet-9.9.9-Windows-x64.exe',
  ]) {
    const input = releaseFixture();
    input.assets[1].browser_download_url = url;
    assert.throws(() => parseRelease(input));
  }
});

test('fetches the public latest endpoint without credentials', async () => {
  const release = await fetchLatestRelease({
    fetchImpl: async (url, options) => {
      assert.equal(url, RELEASE_API);
      assert.equal(options.credentials, 'omit');
      assert.equal(
        'Authorization' in options.headers ? options.headers.Authorization : undefined,
        undefined,
      );
      return { ok: true, json: async () => releaseFixture() };
    },
  });
  assert.equal(release.version, '9.9.9');
});

test('reports rate limits, malformed JSON and timeout without returning partial data', async () => {
  await assert.rejects(
    fetchLatestRelease({
      fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({}) }),
    }),
    /403/,
  );
  await assert.rejects(
    fetchLatestRelease({
      fetchImpl: async () => ({
        ok: true,
        json: async () => {
          throw new SyntaxError('JSON');
        },
      }),
    }),
  );
  await assert.rejects(
    fetchLatestRelease({
      timeoutMs: 5,
      fetchImpl: (_, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason));
        }),
    }),
  );
});
