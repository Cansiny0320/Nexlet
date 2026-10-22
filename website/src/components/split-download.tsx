import { localizedPath } from '../lib/i18n';
import { useSiteTranslation } from '../components/site-language';
import { Menu } from '@base-ui/react/menu';
import { platformOptions, type Platform } from '../lib/releases';
import { Icon, type IconName } from './icon';
import { useSite } from './site-provider';
import { ReleaseStatus, ReleaseVersion } from './release';

export function SplitDownload({ id }: { id: string }) {
  const { t, locale } = useSiteTranslation();

  const { selected, detected, choose, release, hydrated, openMenu, setOpenMenu } = useSite();
  const option = selected ? platformOptions[selected] : null;
  return (
    <div className="download-control" data-download-control>
      <Menu.Root
        open={openMenu === id}
        onOpenChange={(open) => setOpenMenu(open ? id : null)}
        modal={false}
      >
        <div className="split-button">
          <a
            className="download-primary"
            href={selected ? release.platforms[selected] : localizedPath('/download/', locale)}
            data-primary-download
          >
            <span data-platform-icon>
              <Icon name={(option?.icon || 'download') as IconName} />
            </span>
            <span data-download-label>{option?.button ? t(option.button) : t('下载 Nexlet')}</span>
          </a>
          <Menu.Trigger
            className="download-toggle"
            aria-label={t('选择下载平台')}
            hidden={!hydrated}
          >
            <Icon name="chevron" />
          </Menu.Trigger>
        </div>
        <p className="download-hint release-summary">
          <ReleaseStatus /> · <ReleaseVersion />
          {selected && (
            <span data-download-hint>
              {' · '}
              {selected === 'windows-x64'
                ? 'x64'
                : selected === 'macos-arm64'
                  ? 'Apple Silicon'
                  : 'Intel'}
            </span>
          )}
        </p>
        <Menu.Portal>
          <Menu.Positioner
            side="bottom"
            align="end"
            sideOffset={12}
            className="download-positioner"
          >
            <Menu.Popup id={id} className="download-menu" aria-label={t('下载平台')}>
              <Menu.RadioGroup
                value={selected || ''}
                onValueChange={(value) => choose(value as Platform)}
              >
                {(
                  Object.entries(platformOptions) as [
                    Platform,
                    (typeof platformOptions)[Platform],
                  ][]
                ).map(([key, platform]) => (
                  <Menu.RadioItem
                    key={key}
                    value={key}
                    closeOnClick
                    nativeButton
                    render={<button type="button" aria-label={t(platform.label)} />}
                    className={selected === key ? 'is-selected' : ''}
                    data-platform={key}
                    data-url={release.platforms[key]}
                  >
                    <span className="platform-icon">
                      <Icon name={platform.icon as IconName} />
                    </span>
                    <span>{t(platform.label)}</span>
                    <span className="selection-label">{detected === key ? t('当前系统') : ''}</span>
                    <Icon name="check" className="selection-check" />
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}
