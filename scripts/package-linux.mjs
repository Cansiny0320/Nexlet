import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function linuxArchitectures(args) {
  if (!args.length) return ['x64','arm64'];
  if (args.length !== 2 || args[0] !== '--arch' || !['x64','arm64'].includes(args[1])) throw Error('Usage: package-linux.mjs [--arch x64|arm64]');
  return [args[1]];
}
export function verifyLinuxBinary(file, arch) {
  const bytes = readFileSync(file);
  const machine = arch === 'x64' ? 62 : arch === 'arm64' ? 183 : -1;
  if (bytes.length < 20 || bytes.subarray(0,4).toString('hex') !== '7f454c46' || bytes[4] !== 2 || bytes[5] !== 1 || bytes.readUInt16LE(18) !== machine) throw Error(`Wrong native binary architecture: ${file} (expected ${arch})`);
}
/** npm installs optional packages only for the build host. Cross packaging must add the target binary explicitly. */
function ensureKoffi(arch) {
  const name = `@koromix/koffi-linux-${arch}`;
  const destination = path.resolve('node_modules', name);
  const binary = path.join(destination, `linux_${arch}`, 'koffi.node');
  const koffi = JSON.parse(readFileSync('node_modules/koffi/package.json','utf8'));
  const version = koffi.optionalDependencies[name];
  if (!version) throw Error(`Missing koffi dependency declaration: ${name}`);
  if (existsSync(binary) && JSON.parse(readFileSync(path.join(destination,'package.json'),'utf8')).version === version) { verifyLinuxBinary(binary,arch); return; }
  const locked = JSON.parse(readFileSync('package-lock.json','utf8')).packages[`node_modules/${name}`];
  if (!locked?.integrity?.startsWith('sha512-') || locked.version !== version) throw Error(`Missing locked native dependency: ${name}@${version}`);
  mkdirSync('.tmp',{recursive:true});
  const temporary = mkdtempSync(path.resolve('.tmp','linux-native-'));
  try {
    const result = JSON.parse(execFileSync('npm',['pack',`${name}@${version}`,'--ignore-scripts','--json','--pack-destination',temporary],{encoding:'utf8'}));
    const archive = path.join(temporary,path.basename(result[0].filename));
    const integrity = 'sha512-'+createHash('sha512').update(readFileSync(archive)).digest('base64');
    if (integrity !== locked.integrity) throw Error(`Native dependency integrity mismatch: ${name}`);
    mkdirSync(destination,{recursive:true});
    execFileSync('tar',['-xzf',archive,'--strip-components=1','-C',destination],{stdio:'inherit'});
    verifyLinuxBinary(binary,arch);
  } finally { rmSync(temporary,{recursive:true,force:true}); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.platform !== 'linux') throw Error('请在 Linux 或 Linux 容器内打包');
  const architectures=linuxArchitectures(process.argv.slice(2));
  for (const arch of architectures) ensureKoffi(arch);
  execFileSync('npx',['--no-install','electron-builder','--linux','AppImage','deb',...architectures.map(arch=>'--'+arch),'--publish','never'],{stdio:'inherit'});
  for (const arch of architectures) {
    const folder=path.join('release',arch==='x64'?'linux-unpacked':'linux-arm64-unpacked');
    verifyLinuxBinary(path.join(folder,'nexlet'),arch);
    verifyLinuxBinary(path.join(folder,'resources/app.asar.unpacked/node_modules',`@koromix/koffi-linux-${arch}`,`linux_${arch}/koffi.node`),arch);
  }
}
