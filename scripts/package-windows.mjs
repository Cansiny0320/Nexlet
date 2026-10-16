import { build as electronBuild, Platform, Arch } from 'electron-builder';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export async function packageWindows({ output = 'release', build = electronBuild } = {}) {
  const directories = { output: path.resolve(output) };
  // electron-builder shares the first target's archive by architecture. Separate
  // builds keep NSIS non-solid / 1 MiB dictionary and portable solid compression.
  await build({
    targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64),
    publish: 'never',
    config: { directories, nsis: { differentialPackage: true } }
  });
  await build({
    targets: Platform.WINDOWS.createTarget(['portable'], Arch.x64),
    prepackaged: path.join(directories.output, 'win-unpacked'),
    publish: 'never',
    config: { directories }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { output: { type: 'string' } } });
  await packageWindows({ output: values.output });
}
