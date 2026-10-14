import downloads from '../../downloads.json';

export type Platform = keyof typeof downloads.platforms;
export interface Release {
  version: string;
  releaseUrl: string;
  checksumsUrl: string;
  platforms: Record<Platform, string>;
}
export const platformOptions = downloads.platforms;
export const fallbackRelease: Release = {
  version: downloads.version,
  releaseUrl: downloads.releaseUrl,
  checksumsUrl: downloads.checksumsUrl,
  platforms: {
    'windows-x64': downloads.platforms['windows-x64'].url,
    'macos-arm64': downloads.platforms['macos-arm64'].url,
    'macos-x64': downloads.platforms['macos-x64'].url,
  },
};
const repository = 'https://github.com/Cansiny0320/Nexlet';
export const RELEASE_API = 'https://api.github.com/repos/Cansiny0320/Nexlet/releases/latest';
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
export function parseRelease(data: unknown): Release {
  if (
    !isRecord(data) ||
    data.draft !== false ||
    data.prerelease !== false ||
    !data.published_at ||
    typeof data.tag_name !== 'string' ||
    !/^v?\d+\.\d+\.\d+$/.test(data.tag_name) ||
    !Array.isArray(data.assets)
  ) {
    throw new Error('Expected a published stable release');
  }
  const version = data.tag_name.replace(/^v/, '');
  const releaseUrl = `${repository}/releases/tag/${data.tag_name}`;
  if (data.html_url !== releaseUrl) throw new Error('Unexpected release URL');
  const assets = data.assets;
  const assetUrl = (name: string) => {
    const matches = assets.filter(
      (asset) => isRecord(asset) && asset.name === name && asset.state === 'uploaded',
    );
    const expected = `${repository}/releases/download/${data.tag_name}/${name}`;
    if (matches.length !== 1 || matches[0].browser_download_url !== expected) {
      throw new Error(`Missing or invalid release asset: ${name}`);
    }
    return expected;
  };
  return {
    version,
    releaseUrl,
    checksumsUrl: assetUrl('SHA256SUMS.txt'),
    platforms: {
      'windows-x64': assetUrl(`Nexlet-${version}-Windows-x64.exe`),
      'macos-arm64': assetUrl(`Nexlet-${version}-macOS-arm64.dmg`),
      'macos-x64': assetUrl(`Nexlet-${version}-macOS-x64.dmg`),
    },
  };
}
type FetchOptions = RequestInit & { signal: AbortSignal; headers: Record<string, string> };
type ReleaseFetch = (
  url: string,
  init: FetchOptions,
) => Promise<{ ok: boolean; status?: number; json(): Promise<unknown> }>;
export async function fetchLatestRelease({
  fetchImpl = globalThis.fetch,
  timeoutMs = 5000,
  signal,
}: {
  fetchImpl?: ReleaseFetch;
  timeoutMs?: number;
  signal?: AbortSignal;
} = {}): Promise<Release> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json' },
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-cache',
      signal: signal ? AbortSignal.any([controller.signal, signal]) : controller.signal,
    });
    if (!response.ok) throw new Error(`Release request failed: ${response.status}`);
    return parseRelease(await response.json());
  } finally {
    clearTimeout(timer);
  }
}
