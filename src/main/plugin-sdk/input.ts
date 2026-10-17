import { t } from '../../shared/i18n';
import koffi from 'koffi';
import { screen, systemPreferences } from 'electron';
import { runProcess } from './process';
import { object, type SdkContext } from './context';

export class PluginInput {
  private native: ReturnType<typeof createNative> | undefined;
  async invoke(context: SdkContext, method: string, value: unknown): Promise<true> {
    context.require('input.simulate');
    const args = object(value);
    if (process.platform === 'darwin' && !systemPreferences.isTrustedAccessibilityClient(false))
      throw new Error(t('需要系统辅助功能权限'));
    if (method === 'input.key') {
      const code = Number(args.code),
        modifiers = args.modifiers ?? [];
      if (
        !Number.isInteger(code) ||
        code < 0 ||
        code > 255 ||
        !Array.isArray(modifiers) ||
        modifiers.some((m) => !['control', 'shift', 'alt', 'meta'].includes(m))
      )
        throw new Error(t('按键参数无效'));
      if (process.platform === 'linux') {
        this.checkLinux();
        const names: Record<string, string> = {
          control: 'ctrl',
          shift: 'shift',
          alt: 'alt',
          meta: 'super',
        };
        await this.xdo([
          'key',
          '--clearmodifiers',
          [...modifiers.map((m) => names[m]), String(code).padStart(3, '0')].join('+'),
        ]);
      } else (this.native ??= createNative()).key(code, modifiers);
      return true;
    }
    if (method === 'input.mouse') {
      const point =
        args.x === undefined && args.y === undefined
          ? screen.getCursorScreenPoint()
          : { x: Number(args.x), y: Number(args.y) };
      if (
        ![point.x, point.y].every(Number.isFinite) ||
        !['move', 'click', 'doubleClick', 'down', 'up', 'scroll'].includes(String(args.action))
      )
        throw new Error(t('鼠标参数无效'));
      const button = String(args.button ?? 'left');
      if (!['left', 'right', 'middle'].includes(button)) throw new Error(t('鼠标按钮无效'));
      const delta = Number(args.delta ?? 0);
      if (!Number.isInteger(delta) || Math.abs(delta) > 1000) throw new Error(t('滚动量无效'));
      if (process.platform === 'linux') {
        this.checkLinux();
        const b = button === 'left' ? '1' : button === 'middle' ? '2' : '3';
        const physical = screen.dipToScreenPoint(point);
        const commands = [
          'mousemove',
          String(Math.round(physical.x)),
          String(Math.round(physical.y)),
        ];
        if (args.action === 'click' || args.action === 'doubleClick')
          commands.push('click', '--repeat', args.action === 'doubleClick' ? '2' : '1', b);
        if (args.action === 'down' || args.action === 'up')
          commands.push(args.action === 'down' ? 'mousedown' : 'mouseup', b);
        if (args.action === 'scroll' && delta)
          commands.push('click', '--repeat', String(Math.abs(delta)), delta > 0 ? '4' : '5');
        await this.xdo(commands);
      } else {
        const physical = process.platform === 'win32' ? screen.dipToScreenPoint(point) : point;
        (this.native ??= createNative()).mouse(
          String(args.action),
          physical.x,
          physical.y,
          button,
          delta,
        );
      }
      return true;
    }
    throw new Error(t('不支持的输入 API'));
  }
  private checkLinux() {
    if (process.env.XDG_SESSION_TYPE === 'wayland' || process.env.WAYLAND_DISPLAY)
      throw new Error(t('Wayland 不提供此全局输入模拟能力'));
  }
  private async xdo(args: string[]) {
    const result = await runProcess({ executable: 'xdotool', args }, AbortSignal.timeout(5000));
    if (result.code) throw new Error(result.stderr || t('xdotool 执行失败'));
  }
}
function createNative() {
  if (process.platform === 'darwin') {
    const cg = koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics'),
      cf = koffi.load('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation');
    const point = koffi.struct({ x: 'double', y: 'double' });
    const key = cg.func('void *CGEventCreateKeyboardEvent(void *,uint16_t,bool)'),
      flags = cg.func('void CGEventSetFlags(void *,uint64_t)'),
      post = cg.func('void CGEventPost(uint32_t,void *)'),
      release = cf.func('void CFRelease(void *)');
    const mouse = cg.func('CGEventCreateMouseEvent', 'void *', [
      'void *',
      'uint32_t',
      point,
      'uint32_t',
    ]);
    const field = cg.func('void CGEventSetIntegerValueField(void *,uint32_t,int64_t)'),
      scroll = cg.func('void *CGEventCreateScrollWheelEvent(void *,uint32_t,uint32_t,int32_t,...)');
    const emit = (event: unknown) => {
      if (!event) throw new Error(t('系统输入事件创建失败'));
      try {
        post(1, event);
      } finally {
        release(event);
      }
    };
    return {
      key(code: number, modifiers: string[]) {
        const map: Record<string, number> = {
          shift: 1 << 17,
          control: 1 << 18,
          alt: 1 << 19,
          meta: 1 << 20,
        };
        for (const down of [true, false]) {
          const event = key(null, code, down);
          flags(
            event,
            modifiers.reduce((n, m) => n | map[m], 0),
          );
          emit(event);
        }
      },
      mouse(action: string, x: number, y: number, button: string, delta: number) {
        if (action === 'scroll') {
          emit(scroll(null, 1, 1, delta));
          return;
        }
        const b = button === 'left' ? 0 : button === 'right' ? 1 : 2,
          down = b === 0 ? 1 : b === 1 ? 3 : 25,
          up = down + 1;
        const send = (type: number, count = 1) => {
          const event = mouse(null, type, { x, y }, b);
          field(event, 1, count);
          emit(event);
        };
        if (action === 'move') send(5);
        else if (action === 'down') send(down);
        else if (action === 'up') send(up);
        else {
          send(down);
          send(up);
          if (action === 'doubleClick') {
            send(down, 2);
            send(up, 2);
          }
        }
      },
    };
  }
  if (process.platform === 'win32') {
    const user = koffi.load('user32.dll'),
      send = user.func('uint32_t __stdcall SendInput(uint32_t,const void *,int)'),
      move = user.func('bool __stdcall SetCursorPos(int,int)');
    const size = process.arch === 'ia32' ? 28 : 40,
      offset = process.arch === 'ia32' ? 4 : 8;
    const emit = (type: number, code: number, flags: number) => {
      const data = Buffer.alloc(size);
      data.writeUInt32LE(type);
      if (type === 1) {
        data.writeUInt16LE(code, offset);
        data.writeUInt32LE(flags, offset + 4);
      } else {
        data.writeInt32LE(code, offset + 8);
        data.writeUInt32LE(flags, offset + 12);
      }
      if (send(1, data, size) !== 1) throw new Error(t('系统阻止了输入事件'));
    };
    return {
      key(code: number, modifiers: string[]) {
        const map: Record<string, number> = { control: 0x11, shift: 0x10, alt: 0x12, meta: 0x5b },
          held: number[] = [];
        try {
          for (const modifier of modifiers) {
            emit(1, map[modifier], 0);
            held.push(map[modifier]);
          }
          emit(1, code, 0);
          emit(1, code, 2);
        } finally {
          for (const key of held.reverse()) emit(1, key, 2);
        }
      },
      mouse(action: string, x: number, y: number, button: string, delta: number) {
        if (!move(Math.round(x), Math.round(y))) throw new Error(t('无法移动鼠标'));
        const down = button === 'left' ? 2 : button === 'right' ? 8 : 32;
        if (action === 'move') return;
        if (action === 'scroll') {
          emit(0, delta * 120, 0x800);
          return;
        }
        if (action === 'down') emit(0, 0, down);
        else if (action === 'up') emit(0, 0, down * 2);
        else {
          emit(0, 0, down);
          emit(0, 0, down * 2);
          if (action === 'doubleClick') {
            emit(0, 0, down);
            emit(0, 0, down * 2);
          }
        }
      },
    };
  }
  throw new Error(t('当前平台不支持原生输入'));
}
