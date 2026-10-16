import { useSiteTranslation } from '../components/site-language';
import { Icon } from '../components/icon';
import { ShortcutModifier } from '../components/shortcut-modifier';
import { DownloadLink, ReleaseLink, ReleaseVersion, ReleaseStatus } from '../components/release';
export function DownloadPage() {
  const { t } = useSiteTranslation();

  return (
    <>
      <section className="shell download-intro">
        <h1>
          {t('下载 ')}
          <span>{'Nexlet'}</span>
        </h1>
        <p>{t('适用于 Windows 和 macOS')}</p>
      </section>
      {'\n '}
      <section className="shell platform-grid" aria-label={t('选择平台下载安装包')}>
        <article className="platform-card">
          <div className="platform-heading">
            <Icon name="windows" className="platform-mark" />
            <h2>{'Windows'}</h2>
            <span className="pill small">{'x64'}</span>
          </div>
          <DownloadLink className="button primary platform-download" platform="windows-x64">
            <Icon name="download" className="" />
            {t('下载 Windows 版')}
          </DownloadLink>
          <div className="package-label">
            <Icon name="file" className="" />
            {t('便携版 EXE')}
          </div>
        </article>
        <article className="platform-card">
          <div className="platform-heading">
            <Icon name="apple" className="platform-mark" />
            <h2>{'macOS'}</h2>
          </div>
          <div className="mac-download-row">
            <Icon name="chip" className="" />
            <strong>{'Apple Silicon'}</strong>
            <DownloadLink
              className="button primary"
              aria-label={t('下载 macOS Apple Silicon 版')}
              platform="macos-arm64"
            >
              <Icon name="download" className="" />
              {t('下载')}
            </DownloadLink>
          </div>
          <div className="mac-download-row">
            <Icon name="chip" className="" />
            <strong>{'Intel'}</strong>
            <DownloadLink
              className="button primary"
              aria-label={t('下载 macOS Intel 版')}
              platform="macos-x64"
            >
              <Icon name="download" className="" />
              {t('下载')}
            </DownloadLink>
          </div>
          <p className="mac-first-open-hint">
            {t('首次打开可能出现安全提示。')}{' '}
            <a href="#mac-first-open">{t('查看 Mac 首次打开指引')}</a>
          </p>
        </article>
      </section>
      {'\n '}
      <div className="shell release-meta">
        <div>
          <ReleaseLink kind="release">
            {t('更新日志 ')}
            <Icon name="external" className="" />
          </ReleaseLink>
          <span>{'|'}</span>
          <ReleaseLink kind="checksums">
            {t('SHA-256 校验 ')}
            <Icon name="external" className="" />
          </ReleaseLink>
        </div>
        <p>
          <ReleaseStatus />
          {' · Nexlet '}
          <ReleaseVersion />
        </p>
      </div>
      {'\n '}
      <section
        className="shell mac-first-open"
        id="mac-first-open"
        aria-labelledby="mac-first-open-title"
      >
        <h2 id="mac-first-open-title">{t('Mac 首次打开')}</h2>
        <p>
          {t(
            '当前 macOS 版本尚未经过 Apple 公证。确认安装包来自 Nexlet 官方 GitHub Release 后，请按以下步骤打开。',
          )}
        </p>
        <ol>
          <li>{t('将 DMG 中的 Nexlet 拖入「应用程序」文件夹。')}</li>
          <li>
            {t('从「应用程序」打开 Nexlet；如出现「Apple 无法验证 Nexlet」提示，点击「完成」。')}
          </li>
          <li>
            {t('打开「系统设置 → 隐私与安全性」，向下找到 Nexlet 的拦截提示，点击「仍要打开」。')}
          </li>
          <li>{t('按提示验证密码或 Touch ID，再确认「打开」。')}</li>
        </ol>
        <p>{t('没有看到「仍要打开」？请重新尝试打开 Nexlet，再回到该设置页面。')}</p>
        <a href="https://support.apple.com/102445">{t('查看 Apple 官方说明')}</a>
      </section>
      <section className="shell onboarding">
        <div>
          <h2>{t('快速开始')}</h2>
        </div>
        <ol className="onboarding-steps">
          <li>
            <span className="step-number">{'01'}</span>
            <div className="step-visual">
              <span className="download-file">
                <Icon name="file" className="" />
                <Icon name="download" className="" />
              </span>
            </div>
            <h3>{t('下载并打开')}</h3>
            <p>{t('Windows 直接运行；macOS 拖入应用程序。')}</p>
          </li>
          <li>
            <span className="step-number">{'02'}</span>
            <div className="step-visual keys">
              <ShortcutModifier as="kbd" />
              <span>{'+'}</span>
              <kbd>{'Space'}</kbd>
            </div>
            <h3>{t('唤起 Nexlet')}</h3>
            <p>
              {t('默认 ')}
              <ShortcutModifier as="span" />
              {t(' + Space，可在设置中修改。')}
            </p>
          </li>
          <li>
            <span className="step-number">{'03'}</span>
            <div className="step-visual">
              <div className="mini-search">
                <Icon name="search" className="" />
                {t('剪贴板')}
              </div>
            </div>
            <h3>{t('搜索应用与工具')}</h3>
            <p>{t('输入名称、关键词或计算式。')}</p>
          </li>
        </ol>
      </section>
      {'\n '}
      <section className="shell download-faq">
        <div>
          <h2>{t('常见问题')}</h2>
        </div>
        <div className="faq-list">
          <details>
            <summary>
              {t('快捷键被占用了怎么办？')}
              <Icon name="chevron" className="" />
            </summary>
            <p>
              {t('在设置中更换快捷键，例如 Ctrl + ')}
              <ShortcutModifier as="span" />
              {' + Space。'}
            </p>
          </details>
          <details>
            <summary>
              {t('macOS 为什么需要辅助功能权限？')}
              <Icon name="chevron" className="" />
            </summary>
            <p>{t('自动回贴需要辅助功能权限。未授权时，可复制后手动粘贴。')}</p>
          </details>
          <details>
            <summary>
              {t('预览版有哪些限制？')}
              <Icon name="chevron" className="" />
            </summary>
            <p>
              {t(
                'Windows 安装包未签名；macOS 未公证，可能出现系统安全提示。最低系统版本尚未全面验证。',
              )}
            </p>
          </details>
          <details>
            <summary>
              {t('如何检查安装包来源？')}
              <Icon name="chevron" className="" />
            </summary>
            <p>{t('安装包来自 Nexlet 官方 GitHub Release，可通过 SHA-256 校验文件核对。')}</p>
          </details>
        </div>
      </section>
      {'\n '}
      <section className="wide-shell source-banner">
        <span className="large-symbol">
          <Icon name="code" className="" />
        </span>
        <div>
          <h2>{t('从源码构建')}</h2>
        </div>
        <a className="button secondary" href="https://github.com/Cansiny0320/Nexlet">
          {t('查看构建文档 ')}
          <Icon name="external" className="" />
        </a>
      </section>
    </>
  );
}
