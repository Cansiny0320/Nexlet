/** Display names only; keep Electron accelerators in persisted settings. */
export function formatShortcut(value: string, platform: string): string {
  const mac = platform === 'darwin';
  const labels: Record<string, string> = {
    ctrl: mac ? 'Control' : 'Ctrl',
    control: mac ? 'Control' : 'Ctrl',
    alt: mac ? 'Option' : 'Alt',
    option: mac ? 'Option' : 'Alt',
    cmd: 'Command',
    command: 'Command',
    shift: 'Shift',
    cmdorctrl: mac ? 'Command' : 'Ctrl',
    commandorcontrol: mac ? 'Command' : 'Ctrl',
    meta: mac ? 'Command' : platform === 'win32' ? 'Win' : 'Super',
    super: platform === 'win32' ? 'Win' : 'Super',
  };
  return value
    .split('+')
    .map((part) => labels[part.trim().toLowerCase()] ?? part)
    .join('+');
}

export function parseShortcutInput(value: string): string {
  const aliases: Record<string, string> = { win: 'Super', option: 'Alt' };
  return value
    .split('+')
    .map((part) => aliases[part.trim().toLowerCase()] ?? part)
    .join('+');
}
