import { t } from '../shared/i18n';
import type { ShortcutStatus } from '../shared/command-config';
interface Backend {
  register: (accelerator: string, callback: () => void) => boolean;
  unregister: (accelerator: string) => void;
}
export interface ShortcutBinding {
  id: string;
  accelerator: string;
  inactive?: string;
}
export function normalizeAccelerator(value: string, platform: string): string {
  const aliases: Record<string, string> = {
    ctrl: 'Control',
    control: 'Control',
    alt: 'Alt',
    option: 'Alt',
    shift: 'Shift',
    cmd: 'Command',
    command: 'Command',
    meta: platform === 'darwin' ? 'Command' : 'Super',
    super: 'Super',
    cmdorctrl: platform === 'darwin' ? 'Command' : 'Control',
    commandorcontrol: platform === 'darwin' ? 'Command' : 'Control',
  };
  const parts = value.split('+').map((p) => p.trim());
  const modifiers: string[] = [];
  let key = '';
  for (const part of parts) {
    const modifier = aliases[part.toLowerCase()];
    if (modifier) {
      if (!modifiers.includes(modifier)) modifiers.push(modifier);
    } else {
      if (key || !part) throw Error(t('快捷键格式无效'));
      key =
        part.length === 1
          ? part.toUpperCase()
          : {
              space: 'Space',
              enter: 'Return',
              return: 'Return',
              esc: 'Escape',
              escape: 'Escape',
              backspace: 'Backspace',
              delete: 'Delete',
              tab: 'Tab',
              up: 'Up',
              arrowup: 'Up',
              down: 'Down',
              arrowdown: 'Down',
              left: 'Left',
              arrowleft: 'Left',
              right: 'Right',
              arrowright: 'Right',
              plus: 'Plus',
            }[part.toLowerCase()] ||
            (/^f(?:[1-9]|1\d|2[0-4])$/i.test(part) ? part.toUpperCase() : part);
    }
  }
  if (!key || (!modifiers.length && !/^F\d+$/.test(key)))
    throw Error(t('请使用带修饰键的组合键或 F1–F24'));
  const order = ['Command', 'Control', 'Alt', 'Shift', 'Super'];
  return [...order.filter((m) => modifiers.includes(m)), key].join('+');
}
/** Stable callbacks resolve the latest map; swaps never need to unregister a key. */
export class ShortcutManager {
  private active = new Map<string, string>();
  private states = new Map<string, ShortcutStatus>();
  constructor(
    private backend: Backend,
    private dispatch: (id: string) => void,
    private platform = process.platform,
  ) {}
  status(id: string): ShortcutStatus {
    return this.states.get(id) || { desired: '', effective: null };
  }
  statuses() {
    return Object.fromEntries(this.states);
  }
  apply(bindings: ShortcutBinding[], persist: () => void, strict = true) {
    const wanted = new Map<string, string>(),
      states = new Map<string, ShortcutStatus>(),
      added: string[] = [];
    for (const b of bindings) {
      const status: ShortcutStatus = {
        desired: b.accelerator,
        effective: null,
        ...(b.inactive ? { inactive: b.inactive } : {}),
      };
      states.set(b.id, status);
      if (!b.accelerator || b.inactive) continue;
      try {
        const key = normalizeAccelerator(b.accelerator, this.platform);
        if (wanted.has(key)) throw Error(t('{{v0}} 与其他功能快捷键重复', { v0: key }));
        wanted.set(key, b.id);
      } catch (error) {
        if (strict) throw error;
        status.error = String((error as Error).message);
      }
    }
    try {
      for (const [key, id] of [...wanted]) {
        if (!this.active.has(key)) {
          let registered = false;
          try {
            registered = this.backend.register(key, () => {
              const target = this.active.get(key);
              if (target) this.dispatch(target);
            });
          } catch {}
          if (!registered) {
            const message = t('{{v0}} 已被其他应用占用或格式不受支持', { v0: key }),
              previous = this.states.get(id),
              current = states.get(id)!;
            // A startup conflict must not prevent unrelated settings from being saved.
            const unchangedFailure =
              previous?.error && previous.desired === current.desired && !previous.inactive;
            if (strict && !unchangedFailure) throw Error(message);
            current.error = message;
            wanted.delete(key);
            continue;
          }
          added.push(key);
        }
        states.get(id)!.effective = key;
      }
      persist();
    } catch (error) {
      for (const key of added) this.backend.unregister(key);
      throw error;
    }
    const old = this.active;
    this.active = wanted;
    this.states = states;
    for (const key of old.keys()) if (!wanted.has(key)) this.backend.unregister(key);
  }
  close() {
    for (const key of this.active.keys()) this.backend.unregister(key);
    this.active.clear();
  }
}
