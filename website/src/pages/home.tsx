import { useSiteTranslation } from '../components/site-language';
import { Icon } from '../components/icon';
import { LocaleLink as Link } from '../components/site-language';
import { SplitDownload } from '../components/split-download';
import { ShortcutModifier } from '../components/shortcut-modifier';
export function HomePage() {
  const { t } = useSiteTranslation();

  return (
    <>
      <section className="home-hero shell">
        <div className="hero-heading">
          <h1>
            {'Nexlet'}
            <br />
            <span>{t('桌面工具箱')}</span>
          </h1>
          <p>{t('应用搜索、剪贴板、计算与开发工具，一个入口。')}</p>
          <SplitDownload id="hero-downloads" />
        </div>
        <div className="product-showcase" aria-label={t('Nexlet 搜索、剪贴板和计算稿纸界面示意')}>
          <div className="mock-window clipboard-window">
            <div className="mock-title">
              <Icon name="clipboard" className="" />
              <strong>{t('剪贴板')}</strong>
              <span>{'−   ×'}</span>
            </div>
            <div className="clip-rows">
              <div className="clip-row">
                <span className="clip-type text">{'T'}</span>
                <span className="clip-text">{t('会议记录与项目备忘')}</span>
                <time>{t('刚刚')}</time>
                <span className="dots">{'···'}</span>
              </div>
              <div className="clip-row">
                <span className="clip-type link">
                  <Icon name="link" className="" />
                </span>
                <span className="clip-text">{t('项目资料链接')}</span>
                <time>{t('3 分钟前')}</time>
                <span className="dots">{'···'}</span>
              </div>
              <div className="clip-row">
                <span className="clip-type calc">
                  <Icon name="calc" className="" />
                </span>
                <span className="clip-text">{'128 × 3 = 384'}</span>
                <time>{t('5 分钟前')}</time>
                <span className="dots">{'···'}</span>
              </div>
              <div className="clip-row">
                <span className="clip-type file">
                  <Icon name="file" className="" />
                </span>
                <span className="clip-text">{t('设计稿与参考资料')}</span>
                <time>{t('12 分钟前')}</time>
                <span className="dots">{'···'}</span>
              </div>
            </div>
          </div>
          <div className="mock-window scratch-window">
            <div className="mock-title">
              <Icon name="calc" className="" />
              <strong>{t('计算稿纸')}</strong>
              <span>{'−   ×'}</span>
            </div>
            <div className="paper-lines">
              <div>
                <span>{'128 × 3'}</span>
                <strong>
                  <small>{'='}</small>
                  {' 384'}
                </strong>
              </div>
              <div>
                <span>{'384 + 256'}</span>
                <p>{t('后续费用')}</p>
                <strong>
                  <small>{'='}</small>
                  {' 640'}
                </strong>
              </div>
            </div>
            <div className="paper-footer">
              <span>
                <Icon name="check" className="" />
                {t('已保存')}
              </span>
              <span>
                <Icon name="palette" className="" />
                <Icon name="trash" className="" />
                <i>{'···'}</i>
              </span>
            </div>
          </div>
          <div className="mock-window launcher-window">
            <div className="mock-title">
              <span className="brand-symbol">{'N'}</span>
              <strong>{'Nexlet'}</strong>
              <span>{'−   ×'}</span>
            </div>
            <div className="mock-search">
              <Icon name="search" className="" />
              <span>{t('搜索应用、工具或粘贴内容…')}</span>
              <kbd>
                <ShortcutModifier as="span" />
                {' + Space'}
              </kbd>
            </div>
            <div className="launcher-tools">
              <div>
                <span className="tool-icon clipboard">
                  <Icon name="clipboard" className="" />
                </span>
                <span>{t('剪贴板')}</span>
              </div>
              <div>
                <span className="tool-icon calc">
                  <Icon name="calc" className="" />
                </span>
                <span>{t('计算稿纸')}</span>
              </div>
              <div>
                <span className="tool-icon braces">
                  <Icon name="braces" className="" />
                </span>
                <span>{'JSON'}</span>
              </div>
              <div>
                <span className="tool-icon clock">
                  <Icon name="clock" className="" />
                </span>
                <span>{t('时间戳')}</span>
              </div>
              <div>
                <span className="tool-icon globe">
                  <Icon name="globe" className="" />
                </span>
                <span>{t('网页快开')}</span>
              </div>
              <div>
                <span className="tool-icon plugin">
                  <Icon name="plugin" className="" />
                </span>
                <span>{t('插件')}</span>
              </div>
            </div>
          </div>
        </div>
      </section>
      {'\n '}
      <section className="shell home-features" aria-labelledby="features-title">
        <div className="center-heading">
          <h2 id="features-title">{t('常用功能')}</h2>
        </div>
        <div className="feature-grid">
          <article className="feature-card clipboard-feature">
            <div className="feature-title">
              <span className="tool-icon clipboard">
                <Icon name="clipboard" className="" />
              </span>
              <div>
                <h3>{t('剪贴板')}</h3>
                <p>{t('快速查找复制历史')}</p>
              </div>
            </div>
            <div className="clip-rows">
              <div className="clip-row">
                <span className="clip-type text">{'T'}</span>
                <span className="clip-text">{t('会议记录与项目备忘')}</span>
                <time>{t('刚刚')}</time>
                <span className="dots">{'···'}</span>
              </div>
              <div className="clip-row">
                <span className="clip-type link">
                  <Icon name="link" className="" />
                </span>
                <span className="clip-text">{t('项目资料链接')}</span>
                <time>{t('3 分钟前')}</time>
                <span className="dots">{'···'}</span>
              </div>
              <div className="clip-row">
                <span className="clip-type calc">
                  <Icon name="calc" className="" />
                </span>
                <span className="clip-text">{'128 × 3 = 384'}</span>
                <time>{t('5 分钟前')}</time>
                <span className="dots">{'···'}</span>
              </div>
              <div className="clip-row">
                <span className="clip-type file">
                  <Icon name="file" className="" />
                </span>
                <span className="clip-text">{t('设计稿与参考资料')}</span>
                <time>{t('12 分钟前')}</time>
                <span className="dots">{'···'}</span>
              </div>
              <div className="clip-row">
                <span className="clip-type braces">
                  <Icon name="braces" className="" />
                </span>
                <span className="clip-text">{'{ "name": "Nexlet", "type": "desktop" }'}</span>
                <time>{t('18 分钟前')}</time>
                <span className="dots">{'···'}</span>
              </div>
            </div>
          </article>
          <article className="feature-card calculation-feature">
            <div className="feature-title">
              <span className="tool-icon calc">
                <Icon name="calc" className="" />
              </span>
              <div>
                <h3>{t('计算稿纸')}</h3>
                <p>{t('逐行计算，自动保存')}</p>
              </div>
            </div>
            <div className="paper-lines">
              <div>
                <span>{'128 × 3'}</span>
                <strong>
                  <small>{'='}</small>
                  {' 384'}
                </strong>
              </div>
              <div>
                <span>{'384 + 256'}</span>
                <p>{t('后续费用')}</p>
                <strong>
                  <small>{'='}</small>
                  {' 640'}
                </strong>
              </div>
            </div>
            <div className="paper-footer">
              <span>
                <Icon name="check" className="" />
                {t('已保存')}
              </span>
              <span>
                <Icon name="palette" className="" />
                <Icon name="trash" className="" />
                <i>{'···'}</i>
              </span>
            </div>
          </article>
          <div className="feature-stack">
            <article className="feature-card search-feature">
              <div className="feature-title">
                <span className="tool-icon search">
                  <Icon name="search" className="" />
                </span>
                <div>
                  <h3>{t('应用搜索')}</h3>
                  <p>{t('快速找到并打开应用')}</p>
                </div>
              </div>
              <ul className="app-list">
                <li>
                  <Icon name="vscode" className="app-logo vscode" />
                  {'Visual Studio Code '}
                  <span>{'↗'}</span>
                </li>
                <li>
                  <Icon name="wechat" className="app-logo wechat" />
                  {t('微信 ')}
                  <span>{'↗'}</span>
                </li>
                <li>
                  <Icon name="chrome" className="app-logo chrome" />
                  {'Google Chrome '}
                  <span>{'↗'}</span>
                </li>
                <li>
                  <Icon name="notion" className="app-logo notion" />
                  {'Notion '}
                  <span>{'↗'}</span>
                </li>
              </ul>
            </article>
            <article className="feature-card dev-feature">
              <div className="feature-title">
                <span className="tool-icon code">
                  <Icon name="code" className="" />
                </span>
                <div>
                  <h3>{t('开发工具')}</h3>
                  <p>{t('JSON 格式化、时间戳转换等')}</p>
                </div>
              </div>
              <div className="mini-tabs">
                <span>{'JSON'}</span>
                <span>{t('时间戳')}</span>
              </div>
              <pre className="json-preview">
                <code>
                  {'{\n  '}
                  <em>{'"name"'}</em>
                  {': '}
                  <b>{'"Nexlet"'}</b>
                  {',\n  '}
                  <em>{'"type"'}</em>
                  {': '}
                  <b>{'"desktop"'}</b>
                  {',\n  '}
                  <em>{'"awesome"'}</em>
                  {': '}
                  <b>{'true'}</b>
                  {'\n}'}
                </code>
              </pre>
            </article>
          </div>
        </div>
        <div className="home-trust">
          <article className="trust-card">
            <span className="large-symbol">
              <Icon name="folder" className="" />
            </span>
            <div>
              <h3>{t('本地存储')}</h3>
              <p>{t('剪贴板、稿纸和配置保存在你的设备。')}</p>
            </div>
          </article>
          <Link className="trust-card" to="/plugins/">
            <span className="large-symbol">
              <Icon name="code" className="" />
            </span>
            <div>
              <h3>{t('插件扩展')}</h3>
              <p>{t('用 HTML、CSS 和 JavaScript 构建工具。')}</p>
            </div>
            <span className="small-link">{t('插件开发 →')}</span>
          </Link>
        </div>
      </section>
      {'\n '}
      <section className="wide-shell download-banner">
        <h2>{t('开始使用 Nexlet')}</h2>
        <SplitDownload id="footer-downloads" />
      </section>
    </>
  );
}
