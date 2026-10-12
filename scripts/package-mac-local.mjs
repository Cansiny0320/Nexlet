import { execFile } from 'node:child_process';
import { createHash, X509Certificate } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { build, Platform, Arch } from 'electron-builder';
import semver from 'semver';

const exec = promisify(execFile);
const project = fileURLToPath(new URL('..', import.meta.url));
process.chdir(project);
if (process.platform !== 'darwin') throw new Error('本机自签名打包需要 macOS');
const { values } = parseArgs({ options: { arch: { type: 'string', default: process.arch }, version: { type: 'string' }, output: { type: 'string' } } });
if (!['arm64', 'x64', 'universal'].includes(values.arch)) throw new Error('arch 仅支持 arm64、x64 或 universal');
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const version = values.version || pkg.version;
if (!semver.valid(version)) throw new Error('version 必须是有效的 SemVer');
const directory = process.env.NEXLET_SIGNING_DIR || path.join(homedir(), 'Library/Application Support/Nexlet Signing');
const identity = JSON.parse(await readFile(path.join(directory, 'identity.json'), 'utf8'));
const certificate = new X509Certificate(await readFile(path.join(directory, 'certificate.cer')));
const fingerprint = certificate.fingerprint.replaceAll(':', '');
if (fingerprint !== identity.sha1) throw new Error('证书指纹与已保存的身份不符，拒绝更换签名身份');
const password = (await readFile(path.join(directory, 'keychain-password'), 'utf8')).trim();
const output = values.output ? path.resolve(values.output) : path.resolve('release', `local-signed-${version}-${values.arch}`);
const keychains = async () => {
  const { stdout } = await exec('/usr/bin/security', ['list-keychains', '-d', 'user']);
  return stdout.split('\n').map(line => line.trim()).filter(Boolean).map(line => JSON.parse(line));
};
let addedKeychain = false;

try {
  await exec('/usr/bin/security', ['unlock-keychain', '-p', password, identity.keychain]);
  const { stdout } = await exec('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning', identity.keychain]);
  if (!stdout.includes(fingerprint)) throw new Error('专用代码签名证书不可用；请确认钥匙串及当前用户的 codeSign 信任。不会退回 ad-hoc 签名。');
  // codesign needs the certificate chain in the search list even with --keychain.
  const original = await keychains();
  if (!original.includes(identity.keychain)) {
    await exec('/usr/bin/security', ['list-keychains', '-d', 'user', '-s', ...original, identity.keychain]);
    addedKeychain = true;
  }
  // Use only this local identity, even when unrelated CI credentials exist in the environment.
  delete process.env.CSC_LINK;
  delete process.env.CSC_KEY_PASSWORD;
  process.env.CSC_KEYCHAIN = identity.keychain;
  process.env.CSC_NAME = identity.name;
  process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
  await import('./build.mjs');
  await build({
    targets: Platform.MAC.createTarget(['dmg', 'zip'], Arch[values.arch]),
    publish: 'never',
    config: {
      directories: { output },
      extraMetadata: { version },
      forceCodeSigning: true,
      mac: {
        identity: identity.name,
        entitlements: 'assets/entitlements.mac.plist',
        entitlementsInherit: 'assets/entitlements.mac.plist',
        notarize: false,
        timestamp: 'none'
      }
    }
  });
  const folder = values.arch === 'x64' ? 'mac' : `mac-${values.arch}`;
  const application = path.join(output, folder, 'Nexlet.app');
  await exec('/usr/bin/codesign', ['--verify', '--deep', '--strict', application]);
  const prefix = path.join(output, 'signer-');
  await exec('/usr/bin/codesign', ['-d', `--extract-certificates=${prefix}`, application]);
  const signer = new X509Certificate(await readFile(prefix + '0'));
  if (signer.fingerprint !== certificate.fingerprint) throw new Error('打包产物未使用预期证书');
  const { stdout: requirement } = await exec('/usr/bin/codesign', ['-d', '-r-', application]);
  const dmg = path.join(output, `Nexlet-${version}-macOS-${values.arch}.dmg`);
  await exec('/usr/bin/hdiutil', ['verify', dmg]);
  const manifest = {
    version, arch: values.arch, application, dmg, certificateSha1: fingerprint,
    designatedRequirement: requirement.trim(),
    dmgSha256: createHash('sha256').update(await readFile(dmg)).digest('hex'),
    notarized: false
  };
  await writeFile(path.join(output, 'local-signing.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify(manifest, null, 2));
} catch (error) {
  // execFile errors include the command arguments; never print the keychain password.
  console.error(String(error.message).replaceAll(password, '<redacted>'));
  process.exitCode = 1;
  // electron-builder's cleanup can reset exitCode; retain failures at process exit.
  process.on('exit', () => { process.exitCode = 1; });
} finally {
  if (addedKeychain) {
    const current = await keychains();
    await exec('/usr/bin/security', ['list-keychains', '-d', 'user', '-s', ...current.filter(item => item !== identity.keychain)]);
  }
  await exec('/usr/bin/security', ['lock-keychain', identity.keychain]).catch(() => {});
}
