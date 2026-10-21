import { load } from 'js-yaml';

export function lockedPackage(source, name, version) {
  const lock = load(source);
  const resolution = lock?.packages?.[`${name}@${version}`]?.resolution;
  if (!resolution?.integrity?.startsWith('sha512-'))
    throw Error(`Missing locked native dependency: ${name}@${version}`);
  const tarball =
    resolution.tarball ??
    `https://registry.npmjs.org/${name}/-/${name.split('/').at(-1)}-${version}.tgz`;
  const url = new URL(tarball);
  if (url.protocol !== 'https:') throw Error('Native dependency requires HTTPS');
  return { integrity: resolution.integrity, tarball: url.href };
}
