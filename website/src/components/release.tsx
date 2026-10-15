import { useSiteTranslation } from '../components/site-language';
import type { ComponentProps } from 'react';
import type { Platform } from '../lib/releases';
import { useSite } from './site-provider';
export function ReleaseVersion() {
  return <span data-release-version>{useSite().release.version}</span>;
}
export function ReleaseStatus() {
  const { t } = useSiteTranslation();

  const { status } = useSite();
  return (
    <span data-release-status>
      {status === 'latest'
        ? t('最新正式版')
        : status === 'failed'
          ? t('版本检查失败 · 可下载')
          : t('下载版本')}
    </span>
  );
}
export function DownloadLink({
  platform,
  children,
  ...props
}: ComponentProps<'a'> & { platform: Platform }) {
  return (
    <a {...props} data-direct-download={platform} href={useSite().release.platforms[platform]}>
      {children}
    </a>
  );
}
export function ReleaseLink({
  kind,
  children,
  ...props
}: ComponentProps<'a'> & { kind: 'release' | 'checksums' }) {
  const { release } = useSite();
  return (
    <a
      {...props}
      data-release-link={kind === 'release' ? '' : undefined}
      data-checksums-link={kind === 'checksums' ? '' : undefined}
      href={kind === 'release' ? release.releaseUrl : release.checksumsUrl}
    >
      {children}
    </a>
  );
}
