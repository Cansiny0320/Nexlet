import { readFile, appendFile } from 'node:fs/promises';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const lock = await readFile('pnpm-lock.yaml', 'utf8');
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw Error('Invalid package version');
// pnpm does not store the root package version; build jobs validate dependency
// consistency with --frozen-lockfile. Keep tag/version validation here.
if (!/^lockfileVersion: /m.test(lock)) throw Error('Missing pnpm lockfile version');
const tag = `v${version}`;
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== tag) {
  throw Error(`Tag ${process.env.GITHUB_REF_NAME} must match package version ${tag}`);
}
if (process.env.GITHUB_OUTPUT)
  await appendFile(process.env.GITHUB_OUTPUT, `version=${version}\ntag=${tag}\n`);
console.log(JSON.stringify({ version, tag }));
