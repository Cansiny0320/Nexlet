import { Icon } from '../components/icon';
import { Link } from '@tanstack/react-router';
import { SplitDownload } from '../components/split-download';
import { ShortcutModifier } from '../components/shortcut-modifier';
export function HomePage() {
  return (
    <>
      <section className="home-hero shell">
        <div className="hero-glow" />
        <div className="hero-heading">
          <span className="pill">{'为你的桌面而来'}</span>
          <h1>
            {'常用工具，'}
            <br />
            <span>{'随叫随到。'}</span>
          </h1>
          <p>{'应用搜索、剪贴板、计算与开发工具，一个入口。'}</p>
          <SplitDownload id="hero-downloads" />
        </div>
        <div className="scribble scribble-left" aria-hidden="true">
          <span>
            {'一个入口'}
            <br />
            {'更高效的桌面生活'}
          </span>
          <svg viewBox="0 0 70 65">
            <path
              d="M10 2c2 30 21 40 43 46M35 47l20 3-10-17"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="scribble scribble-right" aria-hidden="true">
          <span>
            {'唤醒灵感'}
            <br />
            {'从 Nexlet 开始'}
          </span>
          <svg viewBox="0 0 70 65">
            <path
              d="M10 2c2 30 21 40 43 46M35 47l20 3-10-17"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="product-showcase" aria-label="Nexlet 搜索、剪贴板和计算稿纸界面示意">
          <div className="mock-window clipboard-window">
            <div className="mock-title">
              <Icon name="clipboard" className="" />
              <strong>{'剪贴板'}</strong>
              <span>{'−   ×'}</span>
            </div>
            <div className="clip-rows">
              <div className="clip-row">
                <span className="clip-type text">{'T'}</span>
                <span className="clip-text">{'会议记录与项目备忘'}</span>
                <time>{'刚刚'}</time>
                <span className="dots">{'···'}</span>
              </div>
              <div className="clip-row">
                <span className="clip-type link">
                  <Icon name="link" className="" />
                </span>
                <span className="clip-text">{'项目资料链接'}</span>
                <time>{'3 分钟前'}</time>
                <span className="dots">{'···'}</span>
              </div>
              <div className="clip-row">
                <span className="clip-type calc">
                  <Icon name="calc" className="" />
                </span>
                <span className="clip-text">{'128 × 3 = 384'}</span>
                <time>{'5 分钟前'}</time>
                <span className="dots">{'···'}</span>
              </div>
              <div className="clip-row">
                <span className="clip-type file">
                  <Icon name="file" className="" />
                </span>
                <span className="clip-text">{'设计稿与参考资料'}</span>
                <time>{'12 分钟前'}</time>
                <span className="dots">{'···'}</span>
              </div>
            </div>
          </div>
          <div className="mock-window scratch-window">
            <div className="mock-title">
              <Icon name="calc" className="" />
              <strong>{'计算稿纸'}</strong>
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
                <p>{'后续费用'}</p>
                <strong>
                  <small>{'='}</small>
                  {' 640'}
                </strong>
              </div>
            </div>
            <div className="paper-footer">
              <span>
                <Icon name="check" className="" />
                {'已保存'}
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
              <span>{'搜索应用、工具或粘贴内容…'}</span>
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
                <span>{'剪贴板'}</span>
              </div>
              <div>
                <span className="tool-icon calc">
                  <Icon name="calc" className="" />
                </span>
                <span>{'计算稿纸'}</span>
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
                <span>{'时间戳'}</span>
              </div>
              <div>
                <span className="tool-icon globe">
                  <Icon name="globe" className="" />
                </span>
                <span>{'网页快开'}</span>
              </div>
              <div>
                <span className="tool-icon plugin">
                  <Icon name="plugin" className="" />
                </span>
                <span>{'插件'}</span>
              </div>
            </div>
          </div>
        </div>
      </section>
      {'\n '}
      <section className="shell home-features" aria-labelledby="features-title">
        <div className="center-heading">
          <h2 id="features-title">{'小事顺手，大事专注。'}</h2>
          <p>{'把琐碎的操作交给 Nexlet，让你更专注在真正重要的事上。'}</p>
        </div>
        <div className="feature-grid">
          <article className="feature-card clipboard-feature">
            <div className="feature-title">
              <span className="tool-icon clipboard">
                <Icon name="clipboard" className="" />
              </span>
              <div>
                <h3>{'剪贴板'}</h3>
                <p>{'快速查找复制历史'}</p>
              </div>
            </div>
            <div className="clip-rows">
              <div className="clip-row">
                <span className="clip-type text">{'T'}</span>
                <span className="clip-text">{'会议记录与项目备忘'}</span>
                <time>{'刚刚'}</time>
                <span className="dots">{'···'}</span>
              </div>
              <div className="clip-row">
                <span className="clip-type link">
                  <Icon name="link" className="" />
                </span>
                <span className="clip-text">{'项目资料链接'}</span>
                <time>{'3 分钟前'}</time>
                <span className="dots">{'···'}</span>
              </div>
              <div className="clip-row">
                <span className="clip-type calc">
                  <Icon name="calc" className="" />
                </span>
                <span className="clip-text">{'128 × 3 = 384'}</span>
                <time>{'5 分钟前'}</time>
                <span className="dots">{'···'}</span>
              </div>
              <div className="clip-row">
                <span className="clip-type file">
                  <Icon name="file" className="" />
                </span>
                <span className="clip-text">{'设计稿与参考资料'}</span>
                <time>{'12 分钟前'}</time>
                <span className="dots">{'···'}</span>
              </div>
              <div className="clip-row">
                <span className="clip-type braces">
                  <Icon name="braces" className="" />
                </span>
                <span className="clip-text">{'{ "name": "Nexlet", "type": "desktop" }'}</span>
                <time>{'18 分钟前'}</time>
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
                <h3>{'计算稿纸'}</h3>
                <p>{'逐行计算，自动保存'}</p>
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
                <p>{'后续费用'}</p>
                <strong>
                  <small>{'='}</small>
                  {' 640'}
                </strong>
              </div>
            </div>
            <div className="paper-footer">
              <span>
                <Icon name="check" className="" />
                {'已保存'}
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
                  <h3>{'应用搜索'}</h3>
                  <p>{'快速找到并打开应用'}</p>
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
                  {'微信 '}
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
                  <h3>{'开发工具'}</h3>
                  <p>{'JSON 格式化、时间戳转换等'}</p>
                </div>
              </div>
              <div className="mini-tabs">
                <span>{'JSON'}</span>
                <span>{'时间戳'}</span>
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
              <h3>{'本地存储'}</h3>
              <p>{'剪贴板、稿纸和配置保存在你的设备。'}</p>
            </div>
          </article>
          <Link className="trust-card" to="/plugins/">
            <span className="large-symbol">
              <Icon name="code" className="" />
            </span>
            <div>
              <h3>{'插件扩展'}</h3>
              <p>{'用 HTML、CSS 和 JavaScript 构建工具。'}</p>
            </div>
            <span className="small-link">{'插件开发 →'}</span>
          </Link>
        </div>
      </section>
      {'\n '}
      <section className="wide-shell download-banner">
        <h2>{'开始使用 Nexlet'}</h2>
        <SplitDownload id="footer-downloads" />
      </section>
    </>
  );
}
