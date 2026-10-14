import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { getShortcutModifier, selectPlatform, type PlatformInfo } from '../lib/platform';
import { fallbackRelease, fetchLatestRelease, type Platform, type Release } from '../lib/releases';
import { useHydrated } from '../lib/use-hydrated';

interface BrowserData extends PlatformInfo {
  getHighEntropyValues?: (hints: string[]) => Promise<PlatformInfo>;
}
interface SiteState {
  hydrated: boolean;
  modifier: 'Alt' | 'Option';
  selected: Platform | null;
  detected: Platform | null;
  choose(platform: Platform): void;
  release: Release;
  status: 'fallback' | 'latest' | 'failed';
  openMenu: string | null;
  setOpenMenu(id: string | null): void;
}
const SiteContext = createContext<SiteState | null>(null);
export function SiteProvider({
  children,
  path,
  loadRelease = fetchLatestRelease,
}: {
  children: ReactNode;
  path: string;
  loadRelease?: typeof fetchLatestRelease;
}) {
  const hydrated = useHydrated();
  const [modifier, setModifier] = useState<'Alt' | 'Option'>('Alt');
  const [selected, setSelected] = useState<Platform | null>(null);
  const [detected, setDetected] = useState<Platform | null>(null);
  const [release, setRelease] = useState(fallbackRelease);
  const [status, setStatus] = useState<SiteState['status']>('fallback');
  const [menu, setMenu] = useState<{ path: string; id: string | null }>({ path, id: null });
  const openMenu = menu.path === path ? menu.id : null;
  const setOpenMenu = (id: string | null) => setMenu({ path, id });
  const manualChoice = useRef(false);

  useEffect(() => {
    const data = (navigator as Navigator & { userAgentData?: BrowserData }).userAgentData;
    const info: PlatformInfo = {
      userAgent: navigator.userAgent,
      platform: data?.platform || navigator.platform,
      mobile: data?.mobile,
      maxTouchPoints: navigator.maxTouchPoints,
    };
    // Client hints are external browser state; SSR must retain its deterministic fallback.
    // oxlint-disable-next-line react/set-state-in-effect
    setModifier(getShortcutModifier(info));
    const initial = selectPlatform(info);
    setDetected(initial);
    if (!manualChoice.current) setSelected(initial);
    let active = true;
    async function detectArchitecture() {
      try {
        const extra = await data?.getHighEntropyValues?.(['architecture', 'bitness']);
        if (!active || !extra || manualChoice.current) return;
        const platform = selectPlatform({ ...info, ...extra });
        if (platform || extra.architecture || extra.bitness) {
          setDetected(platform);
          setSelected(platform);
        }
      } catch {
        /* Keep the conservative initial selection when client hints are unavailable. */
      }
    }
    void detectArchitecture();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (path !== '/' && path !== '/download/') return;
    const controller = new AbortController();
    let active = true;
    void loadRelease({ signal: controller.signal })
      .then((next) => {
        if (active) {
          setRelease(next);
          setStatus('latest');
        }
      })
      .catch(() => {
        if (active) setStatus('failed');
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [path, loadRelease]);

  const choose = (platform: Platform) => {
    manualChoice.current = true;
    setSelected(platform);
  };
  return (
    <SiteContext
      value={{
        hydrated,
        modifier,
        selected,
        detected,
        choose,
        release,
        status,
        openMenu,
        setOpenMenu,
      }}
    >
      {children}
    </SiteContext>
  );
}
export function useSite() {
  const state = useContext(SiteContext);
  if (!state) throw new Error('SiteProvider is required');
  return state;
}
