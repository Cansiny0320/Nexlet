import { useEffect, useRef, type DragEvent, type MouseEvent, type PointerEvent } from 'react';
import { api, errorText } from './common';

// Native drag regions swallow clicks, so the launcher shares its input/buttons
// with a thresholded pointer gesture instead.
export function useTitlebarDrag(
  enabled: boolean,
  onError: (message: string, error: boolean) => void,
) {
  const gesture = useRef<{
    pointerId: number;
    x: number;
    y: number;
    moved: boolean;
    target: HTMLElement;
    origin: Promise<[number, number] | null>;
    input: HTMLInputElement | null;
    selection: [number | null, number | null] | null;
  } | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => {
    const cancel = () => {
      gesture.current = null;
      suppressClick.current = false;
    };
    window.addEventListener('blur', cancel);
    return () => {
      cancel();
      window.removeEventListener('blur', cancel);
    };
  }, [enabled]);
  return {
    onPointerDownCapture(event: PointerEvent<HTMLElement>) {
      suppressClick.current = false;
      if (!enabled || event.button !== 0 || !event.isPrimary) return;
      const target = event.target as HTMLElement;
      if (target.closest('dialog')) return;
      // Keep double-click word selection and Shift-click selection available.
      if (target instanceof HTMLInputElement && (event.detail > 1 || event.shiftKey)) return;
      const input = target instanceof HTMLInputElement ? target : null;
      gesture.current = {
        pointerId: event.pointerId,
        x: event.screenX,
        y: event.screenY,
        moved: false,
        target,
        origin: api('window', { action: 'dragStart' }).catch((error) => {
          onError(errorText(error), true);
          return null;
        }),
        input,
        selection: null,
      };
      // Capture on the original target so a simple button click keeps its target.
      if (event.nativeEvent.isTrusted) target.setPointerCapture(event.pointerId);
    },
    onPointerMoveCapture(event: PointerEvent<HTMLElement>) {
      const current = gesture.current;
      if (!current || event.pointerId !== current.pointerId) return;
      if (!(event.buttons & 1)) {
        gesture.current = null;
        return;
      }
      const dx = event.screenX - current.x,
        dy = event.screenY - current.y;
      if (!current.moved && Math.hypot(dx, dy) < 4) return;
      if (!current.moved && current.input)
        current.selection = [current.input.selectionStart, current.input.selectionEnd];
      current.moved = true;
      suppressClick.current = true;
      event.preventDefault();
      void current.origin
        .then(async (origin) => {
          if (!origin) return;
          const native = await api('window', {
            action: 'dragMove',
            x: origin[0] + dx,
            y: origin[1] + dy,
          });
          if (native && gesture.current === current) {
            // AppKit may consume mouse-up; stop pointer capture after the handoff.
            gesture.current = null;
            if (current.target.hasPointerCapture(current.pointerId))
              current.target.releasePointerCapture(current.pointerId);
          }
        })
        .catch((error) => onError(errorText(error), true));
    },
    onPointerUpCapture(event: PointerEvent<HTMLElement>) {
      const current = gesture.current;
      if (!current || event.pointerId !== current.pointerId) return;
      if (current.moved && current.input && current.selection)
        current.input.setSelectionRange(...current.selection);
      gesture.current = null;
    },
    onPointerCancel() {
      gesture.current = null;
      suppressClick.current = false;
    },
    onLostPointerCapture() {
      gesture.current = null;
    },
    onDragStartCapture(event: DragEvent<HTMLElement>) {
      if (enabled) event.preventDefault();
    },
    onClickCapture(event: MouseEvent<HTMLElement>) {
      if (!suppressClick.current) return;
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}
