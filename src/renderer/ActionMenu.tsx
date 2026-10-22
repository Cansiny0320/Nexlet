import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, MoreHorizontal } from 'lucide-react';
import { t } from '../shared/i18n';
import type { ToolResult } from '../shared/launch';
import { api, errorText, useApp } from './common';

export function useActionShortcut(open: () => void) {
  const latest = useRef(open);
  latest.current = open;
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (
        event.isComposing ||
        event.keyCode === 229 ||
        event.repeat ||
        event.defaultPrevented ||
        document.querySelector('.modal-backdrop,dialog[open],[role="menu"]')
      )
        return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !event.altKey) {
        event.preventDefault();
        latest.current();
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, []);
}
export function ActionMenu({
  children,
  x,
  y,
  onClose,
}: {
  children: ReactNode;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null),
    close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = ref.current!;
    const buttons = () => [...element.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    element.querySelectorAll('button').forEach((button) => button.setAttribute('role', 'menuitem'));
    const bounds = element.getBoundingClientRect();
    element.style.left = `${Math.max(6, Math.min(x, innerWidth - bounds.width - 6))}px`;
    element.style.top = `${Math.max(6, Math.min(y, innerHeight - bounds.height - 6))}px`;
    buttons()[0]?.focus();
    const outside = (event: PointerEvent) => {
      if (!element.contains(event.target as Node)) close.current();
    };
    const key = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (['Escape', 'Tab'].includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        const options = buttons(),
          current = options.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? options.length - 1
              : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
        options[next]?.focus();
      }
    };
    window.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', outside);
      window.removeEventListener('keydown', key, true);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      aria-label={t('动作')}
      style={{ left: x, top: y, maxHeight: 'calc(100vh - 12px)', overflowY: 'auto' }}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}
export function ResultActions({
  result,
  shortcut = true,
}: {
  result: ToolResult;
  shortcut?: boolean;
}) {
  const { state, toast } = useApp();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const valid =
    result.type === 'text'
      ? !!result.text
      : result.type === 'image'
        ? !!result.data
        : !!result.paths.length;
  useActionShortcut(() => {
    if (shortcut && valid) setMenu({ x: innerWidth - 240, y: 100 });
  });
  const run = async (action: 'continue' | 'copy' | 'paste') => {
    setMenu(null);
    try {
      if (action === 'continue') await api('continueResult', result);
      else if (result.type === 'text')
        await api('clipAction', {
          action: action === 'paste' ? 'pasteText' : 'writeText',
          text: result.text,
        });
      else if (result.type === 'image')
        await api('clipAction', { action: 'writeImage', data: result.data });
      else await api('clipAction', { action: 'writeFiles', files: result.paths });
      if (action === 'copy') toast(t('已复制'));
    } catch (error) {
      toast(errorText(error), true);
    }
  };
  return (
    <span
      className="result-actions"
      onContextMenu={(event) => {
        if (!valid) return;
        event.preventDefault();
        setMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      <button className="button" disabled={!valid} onClick={() => void run('continue')}>
        <ArrowRight size={15} />
        {t('继续处理')}
      </button>
      <button
        className="button"
        disabled={!valid}
        aria-label={t('结果动作')}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          setMenu({ x: box.right - 220, y: box.bottom });
        }}
      >
        <MoreHorizontal size={16} />
      </button>
      {menu && (
        <ActionMenu {...menu} onClose={() => setMenu(null)}>
          <button onClick={() => void run('copy')}>{t('复制')}</button>
          {result.type === 'text' && (
            <button disabled={!state.canPaste} onClick={() => void run('paste')}>
              {t('执行粘贴')}
            </button>
          )}
          <button onClick={() => void run('continue')}>{t('继续处理')}</button>
        </ActionMenu>
      )}
    </span>
  );
}
