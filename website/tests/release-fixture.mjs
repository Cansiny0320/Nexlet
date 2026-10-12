export function releaseFixture(version = '9.9.9') {
  const base = 'https://github.com/Cansiny0320/Nexlet/releases';
  return {
    tag_name: `v${version}`, draft: false, prerelease: false,
    published_at: '2026-10-12T00:00:00Z', html_url: `${base}/tag/v${version}`,
    assets: [
      `Nexlet-${version}-Windows-x64-Setup.exe`,
      `Nexlet-${version}-Windows-x64.exe`,
      `Nexlet-${version}-macOS-arm64.dmg`,
      `Nexlet-${version}-macOS-x64.dmg`, 'SHA256SUMS.txt'
    ].map(name => ({ name, state: 'uploaded', browser_download_url: `${base}/download/v${version}/${name}` }))
  };
}
