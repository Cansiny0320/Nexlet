import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const folder = path.resolve(process.argv[2] || 'release-assets');
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const required = [
  `Nexlet-${version}-Windows-x64.exe`,
  `Nexlet-${version}-macOS-x64.dmg`,
  `Nexlet-${version}-macOS-x64.dmg.blockmap`,
  `Nexlet-${version}-macOS-arm64.dmg`,
  `Nexlet-${version}-macOS-arm64.dmg.blockmap`,
  `Nexlet-${version}-Windows-x64-Setup.exe`,
  `Nexlet-${version}-Windows-x64-Setup.exe.blockmap`,
  `Nexlet-${version}-macOS-x64.zip`,
  `Nexlet-${version}-macOS-x64.zip.blockmap`,
  `Nexlet-${version}-macOS-arm64.zip`,
  `Nexlet-${version}-macOS-arm64.zip.blockmap`,
  ...['x64', 'arm64'].flatMap((arch) => [
    `Nexlet-${version}-Linux-${arch === 'x64' ? 'x86_64' : arch}.AppImage`,
    `Nexlet-${version}-Linux-${arch === 'x64' ? 'amd64' : arch}.deb`,
  ]),
  'latest-linux.yml',
  'latest-linux-arm64.yml',
  'latest.yml',
  'latest-mac.yml',
  'hello-nexlet.nexlet',
].sort();
const files = (await readdir(folder)).filter((name) => name !== 'SHA256SUMS.txt').sort();
if (JSON.stringify(files) !== JSON.stringify(required))
  throw Error(`Unexpected release files: ${files.join(', ')}`);
const lines = [];
for (const name of files) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path.join(folder, name))) hash.update(chunk);
  lines.push(`${hash.digest('hex')}  ${name}`);
}
await writeFile(path.join(folder, 'SHA256SUMS.txt'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
