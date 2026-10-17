import { execFile } from 'node:child_process';
import { promisify, parseArgs } from 'node:util';
import { randomBytes, X509Certificate } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const exec = promisify(execFile);
const security = async (args, admin = false) => {
  console.log(`[signing] ${args[0]}${admin ? ' (ephemeral runner admin)' : ''}`);
  return admin
    ? exec('sudo', ['-n', '/usr/bin/security', ...args], { timeout: 60000 })
    : exec('security', args, { timeout: 60000 });
};
const sha1 = '69397314808BC8B95C8B4AF0FBDFA53C0184FC2C';
const name = 'Nexlet Local Code Signing';
const { values } = parseArgs({ options: { arch: { type: 'string' } } });
if (process.platform !== 'darwin' || !['arm64', 'x64'].includes(values.arch))
  throw Error('CI 签名仅支持 macOS arm64/x64');
if (
  process.env.GITHUB_EVENT_NAME === 'pull_request' ||
  process.env.GITHUB_EVENT_NAME === 'pull_request_target'
)
  throw Error('PR 不得使用发布签名凭据');
if (
  process.env.GITHUB_REF !== 'refs/heads/main' &&
  !process.env.GITHUB_REF?.startsWith('refs/tags/v')
)
  throw Error('固定证书仅用于 main 或版本标签构建');
if (process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted')
  throw Error('CI 信任设置仅允许在一次性 GitHub 托管 runner 上执行');
const encoded = process.env.NEXLET_MAC_CERTIFICATE_P12;
const certificatePassword = process.env.NEXLET_MAC_CERTIFICATE_PASSWORD;
if (!encoded || !certificatePassword) throw Error('缺少固定签名 Secrets，拒绝生成正式发布包');
const password = randomBytes(32).toString('hex');
const directory = await mkdtemp(path.join(process.env.RUNNER_TEMP || tmpdir(), 'nexlet-signing-'));
const keychain = path.join(directory, 'ci.keychain-db');
const certificateFile = path.join(directory, 'certificate.cer');
let created = false,
  trusted = false;
try {
  await writeFile(path.join(directory, 'identity.p12'), Buffer.from(encoded, 'base64'), {
    mode: 0o600,
  });
  await security(['create-keychain', '-p', password, keychain]);
  created = true;
  await security(['set-keychain-settings', '-lut', '21600', keychain]);
  await security(['unlock-keychain', '-p', password, keychain]);
  await security([
    'import',
    path.join(directory, 'identity.p12'),
    '-k',
    keychain,
    '-P',
    certificatePassword,
    '-T',
    '/usr/bin/codesign',
    '-T',
    '/usr/bin/security',
  ]);
  await security([
    'set-key-partition-list',
    '-S',
    'apple-tool:,apple:,codesign:',
    '-s',
    '-k',
    password,
    keychain,
  ]);
  const { stdout } = await security(['find-certificate', '-c', name, '-p', keychain]);
  const certificate = new X509Certificate(stdout);
  if (certificate.fingerprint.replaceAll(':', '') !== sha1)
    throw Error('CI 证书指纹不符，拒绝更换应用身份');
  await writeFile(certificateFile, certificate.raw, { mode: 0o600 });
  // Per-user trust prompts for UI authorization; admin trust is noninteractive on hosted runners.
  await security(
    [
      'add-trusted-cert',
      '-d',
      '-r',
      'trustRoot',
      '-p',
      'codeSign',
      '-k',
      keychain,
      certificateFile,
    ],
    true,
  );
  trusted = true;
  await writeFile(path.join(directory, 'identity.json'), JSON.stringify({ name, sha1, keychain }), {
    mode: 0o600,
  });
  await writeFile(path.join(directory, 'keychain-password'), password, { mode: 0o600 });
  console.log('[signing] identity verified; building signed artifacts');
  const packaging = exec(
    process.execPath,
    ['scripts/package-mac-local.mjs', '--arch', values.arch, '--output', 'release'],
    {
      env: { ...process.env, NEXLET_SIGNING_DIR: directory },
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  packaging.child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  packaging.child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  await packaging;
} catch (error) {
  let message = String(error.message);
  for (const secret of [encoded, certificatePassword, password])
    message = message.replaceAll(secret, '<redacted>');
  console.error(message);
  process.exitCode = 1;
} finally {
  let cleanupFailed = false;
  if (trusted) {
    try {
      // remove-trusted-cert can still prompt on hosted macOS. Replace the explicit
      // grant with Unspecified, then verify that this identity is no longer trusted.
      await security(
        [
          'add-trusted-cert',
          '-d',
          '-r',
          'unspecified',
          '-p',
          'codeSign',
          '-k',
          keychain,
          certificateFile,
        ],
        true,
      );
      const { stdout } = await security(['find-identity', '-v', '-p', 'codesigning', keychain]);
      if (stdout.includes(sha1)) throw Error('Signing identity remains trusted');
      console.log('[signing] Code Signing trust revoked and verified');
    } catch {
      cleanupFailed = true;
      console.error('CI 证书信任撤销未通过验证');
    }
  }
  if (created) {
    try {
      await security(['delete-keychain', keychain]);
    } catch {
      cleanupFailed = true;
      console.error('CI 临时钥匙串删除失败');
    }
  }
  await rm(directory, { recursive: true, force: true });
  if (cleanupFailed) process.exitCode = 1;
}
