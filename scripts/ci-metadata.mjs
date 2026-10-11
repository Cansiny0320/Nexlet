import { readFile, appendFile } from 'node:fs/promises';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw Error('Invalid package version');
if (lock.version !== version || lock.packages[''].version !== version) throw Error('package-lock.json version does not match package.json');
const tag = `v${version}`;
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== tag) {
  throw Error(`Tag ${process.env.GITHUB_REF_NAME} must match package version ${tag}`);
}
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `version=${version}\ntag=${tag}\n`);
console.log(JSON.stringify({ version, tag }));
