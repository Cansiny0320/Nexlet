import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import yaml from 'js-yaml';

export async function prepareUpdateMetadata(folder, version) {
  const read = async name => yaml.load(await readFile(path.join(folder, name), 'utf8'));
  const intel = await read('latest-mac-x64.yml'), arm = await read('latest-mac-arm64.yml'), windows = await read('latest.yml'), linux = await read('latest-linux.yml'), linuxArm = await read('latest-linux-arm64.yml');
  const expected = {
    intel: [`Nexlet-${version}-macOS-x64.zip`, `Nexlet-${version}-macOS-x64.dmg`],
    arm: [`Nexlet-${version}-macOS-arm64.zip`, `Nexlet-${version}-macOS-arm64.dmg`],
    windows: [`Nexlet-${version}-Windows-x64-Setup.exe`],
    linux: [`Nexlet-${version}-Linux-x86_64.AppImage`, `Nexlet-${version}-Linux-amd64.deb`],
    linuxArm: [`Nexlet-${version}-Linux-arm64.AppImage`, `Nexlet-${version}-Linux-arm64.deb`]
  };
  for (const [label, info] of Object.entries({ intel, arm, windows, linux, linuxArm })) {
    if (info.version !== version || !Array.isArray(info.files)) throw Error(`Invalid ${label} update version/files`);
    if (JSON.stringify(info.files.map(file => file.url).sort()) !== JSON.stringify(expected[label].sort())) throw Error(`Unexpected ${label} update assets`);
    for (const file of info.files) {
      const asset = path.join(folder, file.url), hash = createHash('sha512');
      for await (const chunk of createReadStream(asset)) hash.update(chunk);
      if (hash.digest('base64') !== file.sha512 || (await stat(asset)).size !== file.size) throw Error(`Invalid update checksum/size: ${file.url}`);
    }
    const primary = info.files.find(file => file.url === info.path);
    if (!primary || primary.sha512 !== info.sha512) throw Error(`Invalid ${label} legacy update path`);
  }
  await writeFile(path.join(folder, 'latest-mac.yml'), yaml.dump({ ...intel, files: [...intel.files, ...arm.files] }));
  await unlink(path.join(folder, 'latest-mac-x64.yml'));
  await unlink(path.join(folder, 'latest-mac-arm64.yml'));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { version } = JSON.parse(await readFile('package.json', 'utf8'));
  await prepareUpdateMetadata(path.resolve(process.argv[2] || 'release-assets'), version);
}
