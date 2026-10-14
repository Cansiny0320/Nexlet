import { Icon } from '../components/icon';
import { ShortcutModifier } from '../components/shortcut-modifier';
import { DownloadLink, ReleaseLink, ReleaseVersion, ReleaseStatus } from '../components/release';
export function DownloadPage() {
  return (
    <>
      <section className="shell download-intro">
        <h1>
          {'下载 '}
          <span>{'Nexlet'}</span>
        </h1>
        <p>{'适用于 Windows 和 macOS'}</p>
      </section>
      {'\n '}
      <section className="shell platform-grid" aria-label="选择平台下载安装包">
        <article className="platform-card">
          <div className="platform-heading">
            <Icon name="windows" className="platform-mark" />
            <h2>{'Windows'}</h2>
            <span className="pill small">{'x64'}</span>
          </div>
          <DownloadLink className="button primary platform-download" platform="windows-x64">
            <Icon name="download" className="" />
            {'下载 Windows 版'}
          </DownloadLink>
          <div className="package-label">
            <Icon name="file" className="" />
            {'便携版 EXE'}
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
              aria-label="下载 macOS Apple Silicon 版"
              platform="macos-arm64"
            >
              <Icon name="download" className="" />
              {'下载'}
            </DownloadLink>
          </div>
          <div className="mac-download-row">
            <Icon name="chip" className="" />
            <strong>{'Intel'}</strong>
            <DownloadLink
              className="button primary"
              aria-label="下载 macOS Intel 版"
              platform="macos-x64"
            >
              <Icon name="download" className="" />
              {'下载'}
            </DownloadLink>
          </div>
        </article>
      </section>
      {'\n '}
      <div className="shell release-meta">
        <div>
          <ReleaseLink kind="release">
            {'更新日志 '}
            <Icon name="external" className="" />
          </ReleaseLink>
          <span>{'|'}</span>
          <ReleaseLink kind="checksums">
            {'SHA-256 校验 '}
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
      <section className="shell onboarding">
        <div>
          <h2>{'快速开始'}</h2>
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
            <h3>{'下载并打开'}</h3>
            <p>{'Windows 直接运行；macOS 拖入应用程序。'}</p>
          </li>
          <li>
            <span className="step-number">{'02'}</span>
            <div className="step-visual keys">
              <ShortcutModifier as="kbd" />
              <span>{'+'}</span>
              <kbd>{'Space'}</kbd>
            </div>
            <h3>{'唤起 Nexlet'}</h3>
            <p>
              {'默认 '}
              <ShortcutModifier as="span" />
              {' + Space，可在设置中修改。'}
            </p>
          </li>
          <li>
            <span className="step-number">{'03'}</span>
            <div className="step-visual">
              <div className="mini-search">
                <Icon name="search" className="" />
                {'剪贴板'}
              </div>
            </div>
            <h3>{'搜索应用与工具'}</h3>
            <p>{'输入名称、关键词或计算式。'}</p>
          </li>
        </ol>
      </section>
      {'\n '}
      <section className="shell download-faq">
        <div>
          <h2>{'常见问题'}</h2>
        </div>
        <div className="faq-list">
          <details>
            <summary>
              {'快捷键被占用了怎么办？'}
              <Icon name="chevron" className="" />
            </summary>
            <p>
              {'在设置中更换快捷键，例如 Ctrl + '}
              <ShortcutModifier as="span" />
              {' + Space。'}
            </p>
          </details>
          <details>
            <summary>
              {'macOS 为什么需要辅助功能权限？'}
              <Icon name="chevron" className="" />
            </summary>
            <p>{'自动回贴需要辅助功能权限。未授权时，可复制后手动粘贴。'}</p>
          </details>
          <details>
            <summary>
              {'预览版有哪些限制？'}
              <Icon name="chevron" className="" />
            </summary>
            <p>
              {
                'Windows 安装包未签名；macOS 未公证，可能出现系统安全提示。最低系统版本尚未全面验证。'
              }
            </p>
          </details>
          <details>
            <summary>
              {'如何检查安装包来源？'}
              <Icon name="chevron" className="" />
            </summary>
            <p>{'安装包来自 Nexlet 官方 GitHub Release，可通过 SHA-256 校验文件核对。'}</p>
          </details>
        </div>
      </section>
      {'\n '}
      <section className="wide-shell source-banner">
        <span className="large-symbol">
          <Icon name="code" className="" />
        </span>
        <div>
          <h2>{'从源码构建'}</h2>
        </div>
        <a className="button secondary" href="https://github.com/Cansiny0320/Nexlet">
          {'查看构建文档 '}
          <Icon name="external" className="" />
        </a>
      </section>
    </>
  );
}
