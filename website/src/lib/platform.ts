export interface PlatformInfo {
  platform?: string;
  architecture?: string;
  bitness?: string;
  userAgent?: string;
  mobile?: boolean;
  maxTouchPoints?: number;
}
/** Shortcut labels depend on the OS, even when its CPU architecture is unknown. */
export function getShortcutModifier({
  platform = '',
  userAgent = '',
  mobile = false,
  maxTouchPoints = 0,
}: PlatformInfo = {}) {
  const mac = /^mac(os|intel|arm)$/i.test(platform) || /macintosh/i.test(userAgent);
  if (mobile || /android|iphone|ipad|ipod/i.test(userAgent) || maxTouchPoints > 1) return 'Alt';
  return mac ? 'Option' : 'Alt';
}

/** Select only an artifact supported by reliable platform/architecture evidence. */
export function selectPlatform({
  platform = '',
  architecture = '',
  bitness = '',
  userAgent = '',
  mobile = false,
  maxTouchPoints = 0,
}: PlatformInfo = {}) {
  const p = platform.toLowerCase(),
    a = architecture.toLowerCase();
  if (
    mobile ||
    /android|iphone|ipad|ipod/i.test(userAgent) ||
    (p === 'macintel' && maxTouchPoints > 1)
  )
    return null;
  if (p === 'windows' || p === 'win32' || /windows nt/i.test(userAgent)) {
    if (a === 'arm' || bitness === '32') return null;
    if ((a === 'x86' && bitness === '64') || /win64|wow64|x64/i.test(userAgent))
      return 'windows-x64';
    return null;
  }
  if (p === 'macos' || p === 'macintel' || p === 'macarm' || /macintosh/i.test(userAgent)) {
    if (bitness === '64' && a === 'arm') return 'macos-arm64';
    if (bitness === '64' && a === 'x86') return 'macos-x64';
  }
  return null;
}
