import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Runs only a purpose-built NSIS fixture. ExitProcess in GUIINIT prevents the
// dialog from ever appearing; no files, shortcuts or registry entries install.
if (process.platform !== 'win32' || !process.argv[2]) {
  throw new Error('Usage on Windows: node scripts/smoke-installer-icons.mjs <makensis.exe>');
}
const root = process.cwd();
const config = JSON.parse(readFileSync('package.json', 'utf8')).build;
mkdirSync('.tmp', { recursive: true });
const dir = mkdtempSync(path.join(root, '.tmp', 'installer-icons-'));
const run = (exe, args) => {
  const result = spawnSync(exe, args, { cwd: dir, windowsHide: true, encoding: 'utf8', timeout: 30000 });
  if (result.error) throw result.error;
  return result;
};

for (const fixed of [false, true]) {
  const name = fixed ? 'fixed' : 'baseline';
  const source = `
Unicode true
Name "Nexlet icon regression"
OutFile "${name}.exe"
RequestExecutionLevel user
!define MUI_ICON "${path.resolve(config.win.icon)}"
!define MUI_UNICON "${path.resolve(config.win.icon)}"
!include "${path.resolve(config.nsis.include)}"
; Unlike electron-builder, this fixture builds both in one compilation.
!insertmacro NexletWindowIcons "un."
!undef MUI_CUSTOMFUNCTION_GUIINIT
!define MUI_CUSTOMFUNCTION_GUIINIT CheckIcons
!define MUI_CUSTOMFUNCTION_UNGUIINIT un.CheckIcons
!include "MUI2.nsh"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Function .onInit
  IfSilent 0 done
  WriteUninstaller "$EXEDIR\\${name}-uninstall.exe"
  SetErrorLevel 0
  Quit
  done:
FunctionEnd

!macro CheckIcons PREFIX
Function \${PREFIX}CheckIcons
  ${fixed ? 'Call ${PREFIX}NexletSetWindowIcons' : '; Baseline: NSIS only sets the dialog class icon.'}
  System::Call 'kernel32::GetModuleHandleW(p 0) p .r0'
  System::Call 'user32::GetSystemMetrics(i 49) i .r1'
  System::Call 'user32::GetSystemMetrics(i 50) i .r2'
  System::Call 'user32::LoadImageW(p r0, p 103, i 1, i r1, i r2, i 0x8000) p .r3'
  StrCmp $3 0 fail
  SendMessage $HWNDPARENT 0x7F 0 0 $4 ; WM_GETICON, ICON_SMALL
  StrCmp $3 $4 0 fail
  System::Call 'user32::GetSystemMetrics(i 11) i .r1'
  System::Call 'user32::GetSystemMetrics(i 12) i .r2'
  System::Call 'user32::LoadImageW(p r0, p 103, i 1, i r1, i r2, i 0x8000) p .r3'
  StrCmp $3 0 fail
  SendMessage $HWNDPARENT 0x7F 1 0 $4 ; WM_GETICON, ICON_BIG
  StrCmp $3 $4 0 fail
  System::Call 'kernel32::ExitProcess(i 0)'
  fail:
  System::Call 'kernel32::ExitProcess(i 42)'
FunctionEnd
!macroend
!insertmacro CheckIcons ""
!insertmacro CheckIcons "un."
Section
SectionEnd
Section "Uninstall"
SectionEnd
`;
  const script = path.join(dir, `${name}.nsi`);
  writeFileSync(script, source);
  const compilation = run(path.resolve(process.argv[2]), ['/V2', script]);
  assert.equal(compilation.status, 0, compilation.stdout + compilation.stderr);
  const installer = path.join(dir, `${name}.exe`);
  assert.equal(run(installer, ['/S']).status, 0, 'Generate the test uninstaller');
  for (const [kind, exe, args] of [
    ['installer', installer, []],
    ['uninstaller', path.join(dir, `${name}-uninstall.exe`), [`_?=${dir}`]],
  ]) {
    const result = run(exe, args);
    assert.equal(result.status, fixed ? 0 : 42, `${name} ${kind}: ${result.stdout}${result.stderr}`);
    console.log(`${name} ${kind}: ${fixed ? 'both window icons match Nexlet resources' : 'missing explicit window icons reproduced'}`);
  }
}
