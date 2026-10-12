const repository = 'https://github.com/Cansiny0320/Nexlet';
export const RELEASE_API = 'https://api.github.com/repos/Cansiny0320/Nexlet/releases/latest';

// Require one complete release before changing any visible download information.
export function parseRelease(data) {
  if (!data || data.draft !== false || data.prerelease !== false || !data.published_at ||
      !/^v?\d+\.\d+\.\d+$/.test(data.tag_name) || !Array.isArray(data.assets)) {
    throw new Error('Expected a published stable release');
  }
  const version = data.tag_name.replace(/^v/, '');
  const releaseUrl = `${repository}/releases/tag/${data.tag_name}`;
  if (data.html_url !== releaseUrl) throw new Error('Unexpected release URL');
  const assetUrl = name => {
    const matches = data.assets.filter(asset => asset.name === name && asset.state === 'uploaded');
    const expected = `${repository}/releases/download/${data.tag_name}/${name}`;
    if (matches.length !== 1 || matches[0].browser_download_url !== expected) {
      throw new Error(`Missing or invalid release asset: ${name}`);
    }
    return matches[0].browser_download_url;
  };
  return {
    version, releaseUrl, checksumsUrl: assetUrl('SHA256SUMS.txt'),
    platforms: {
      'windows-x64': assetUrl(`Nexlet-${version}-Windows-x64.exe`),
      'macos-arm64': assetUrl(`Nexlet-${version}-macOS-arm64.dmg`),
      'macos-x64': assetUrl(`Nexlet-${version}-macOS-x64.dmg`)
    }
  };
}

export async function fetchLatestRelease({ fetchImpl = globalThis.fetch, timeoutMs = 5000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json' },
      credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-cache', signal: controller.signal
    });
    if (!response.ok) throw new Error(`Release request failed: ${response.status}`);
    return parseRelease(await response.json());
  } finally {
    clearTimeout(timer);
  }
}

export function applyRelease(root, release) {
  for (const option of root.querySelectorAll('[data-platform]')) {
    option.dataset.url = release.platforms[option.dataset.platform];
  }
  for (const link of root.querySelectorAll('[data-direct-download]')) {
    link.href = release.platforms[link.dataset.directDownload];
  }
  // Preserve both manual choices and platform detection that finished during fetch.
  for (const control of root.querySelectorAll('[data-download-control]')) {
    const selected = control.querySelector('[data-platform].is-selected');
    if (selected) control.querySelector('[data-primary-download]').href = selected.dataset.url;
  }
  for (const label of root.querySelectorAll('[data-release-version]')) label.textContent = release.version;
  for (const link of root.querySelectorAll('[data-release-link]')) link.href = release.releaseUrl;
  for (const link of root.querySelectorAll('[data-checksums-link]')) link.href = release.checksumsUrl;
  for (const label of root.querySelectorAll('[data-release-status]')) label.textContent = '最新正式版';
}

export async function refreshRelease(root = document) {
  if (!root.querySelector('[data-release-status]')) return;
  try {
    applyRelease(root, await fetchLatestRelease());
  } catch {
    for (const label of root.querySelectorAll('[data-release-status]')) {
      label.textContent = '暂未获取到最新版本，以下为已知可用版本';
    }
  }
}
