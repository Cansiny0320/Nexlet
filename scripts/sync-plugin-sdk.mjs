import ts from 'typescript';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.resolve(root, process.argv[2] || '../Nexlet-plugins/sdk');
const file = path.join(root, 'src/shared/plugin-api.ts');
const program = ts.createProgram([file], {
  target: ts.ScriptTarget.ES2023,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  declaration: true,
  emitDeclarationOnly: true,
  skipLibCheck: true,
  strict: true,
});
let declaration;
const result = program.emit(undefined, (name, text) => {
  if (name.endsWith('plugin-api.d.ts')) declaration = text;
});
const errors = [...ts.getPreEmitDiagnostics(program), ...result.diagnostics].filter(
  (d) => d.category === ts.DiagnosticCategory.Error,
);
if (errors.length || !declaration)
  throw new Error(
    ts.formatDiagnosticsWithColorAndContext(errors, {
      getCanonicalFileName: (f) => f,
      getCurrentDirectory: () => root,
      getNewLine: () => '\n',
    }) || 'No declarations emitted',
  );
await mkdir(destination, { recursive: true });
await writeFile(
  path.join(destination, 'extensions.d.ts'),
  '// Generated from Nexlet/src/shared/plugin-api.ts.\n' +
    declaration.replace('export declare const SDK_PERMISSIONS:', 'declare const SDK_PERMISSIONS:'),
);
await writeFile(
  path.join(destination, 'index.d.ts'),
  await readFile(path.join(root, 'sdk/index.d.ts')),
);
console.log(`Synced public plugin types to ${destination}`);
