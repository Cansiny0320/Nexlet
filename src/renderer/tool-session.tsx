import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
export interface ToolSession {
  initial: Record<string, unknown>;
  values: Record<string, unknown>;
  before: Set<() => Promise<void>>;
  restores: Set<Promise<unknown>>;
}
export const ToolSessionContext = createContext<ToolSession | null>(null);
export function createToolSession(initial: Record<string, unknown> = {}): ToolSession {
  return { initial, values: {}, before: new Set(), restores: new Set() };
}
export function useToolState<T>(
  key: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const session = useContext(ToolSessionContext);
  const [value, setValue] = useState<T>(() =>
    session && key in session.initial
      ? (session.initial[key] as T)
      : typeof initial === 'function'
        ? (initial as () => T)()
        : initial,
  );
  useLayoutEffect(() => {
    if (session) session.values[key] = value;
  }, [session, key, value]);
  return [value, setValue];
}
export function useBeforeDetach(callback: () => Promise<void>) {
  const session = useContext(ToolSessionContext),
    latest = useRef(callback);
  latest.current = callback;
  useEffect(() => {
    const run = () => latest.current();
    session?.before.add(run);
    return () => {
      session?.before.delete(run);
    };
  }, [session]);
}
export function useRestoreBarrier() {
  return useContext(ToolSessionContext);
}
