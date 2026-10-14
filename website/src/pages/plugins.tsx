import { Icon } from '../components/icon';
import { CopyButton } from '../components/copy-button';
export function PluginsPage() {
  return (
    <>
      <section className="shell plugins-hero">
        <div className="plugins-intro">
          <span className="pill">{'NEXLET PLUGIN API V1'}</span>
          <h1>
            {'把你的工具，'}
            <br />
            <span>{'接进 Nexlet。'}</span>
          </h1>
          <p>{'熟悉的 Web 技术，明确的桌面能力。'}</p>
          <div className="actions">
            <a
              className="button primary"
              href="https://github.com/Cansiny0320/Nexlet/blob/main/docs/plugin-sdk.md"
            >
              {'阅读开发文档 '}
              <Icon name="external" className="" />
            </a>
            <a
              className="button secondary"
              href="https://github.com/Cansiny0320/Nexlet/tree/main/examples/hello-nexlet"
            >
              {'查看示例 '}
              <Icon name="external" className="" />
            </a>
          </div>
          <div className="language-pills">
            <span>{'HTML'}</span>
            <span>{'CSS'}</span>
            <span>{'JavaScript'}</span>
          </div>
        </div>
        <div className="plugin-showcase">
          <div className="code-editor">
            <div className="editor-header">
              <span>
                {'main.js '}
                <b>{'×'}</b>
              </span>
              <i />
              <i />
              <i />
            </div>
            <ol>
              <li>
                <code>
                  <em>{'const'}</em>
                  {' note = '}
                  <em>{'await'}</em>
                  {' nexlet.storage.'}
                  <b>{'get'}</b>
                  {'('}
                  <strong>{"'note'"}</strong>
                  {');'}
                </code>
              </li>
              <li>
                <code>
                  <em>{'await'}</em>
                  {' nexlet.clipboard.'}
                  <u>{'writeText'}</u>
                  {'(note ?? '}
                  <strong>{"'Hello Nexlet'"}</strong>
                  {');'}
                </code>
              </li>
              <li />
              <li>
                <code className="code-comment">{'// 你的插件，从这里开始'}</code>
              </li>
              <li />
            </ol>
          </div>
          <div className="sample-plugin">
            <div className="mock-title">
              <span className="brand-symbol">{'N'}</span>
              <strong>{'示例便笺'}</strong>
              <span>{'−   ×'}</span>
            </div>
            <p>{'一个顺手的小工具。'}</p>
            <CopyButton className="button primary" text="一个顺手的小工具。">
              {'复制内容'}
            </CopyButton>
          </div>
        </div>
      </section>
      {'\n '}
      <section className="wide-shell plugin-directory">
        <div className="file-tree">
          <h3>
            <Icon name="folder" className="" />
            {'我的插件 '}
            <Icon name="chevron" className="" />
          </h3>
          <div>
            <Icon name="file" className="" />
            {'plugin.json'}
          </div>
          <div>
            <Icon name="code" className="" />
            {'index.html'}
          </div>
          <div className="selected">
            <span className="js-logo">{'JS'}</span>
            {'main.js'}
          </div>
        </div>
        <div>
          <h2>{'一个目录，就是起点。'}</h2>
          <p>{'只需几个文件，就能让你的创意在 Nexlet 中运行。'}</p>
          <ol className="plugin-steps">
            <li>
              <h3>
                <span>{'1'}</span>
                {'编写界面'}
              </h3>
              <p>
                {'使用你熟悉的 HTML、CSS'}
                <br />
                {'和 JavaScript，构建插件界面与功能逻辑。'}
              </p>
            </li>
            <li>
              <h3>
                <span>{'2'}</span>
                {'加载开发目录'}
              </h3>
              <p>{'在 Nexlet 中选择你的插件目录，重新打开窗口即可预览文件改动。'}</p>
            </li>
            <li>
              <h3>
                <span>{'3'}</span>
                {'确认权限并运行'}
              </h3>
              <p>{'根据插件需要确认所需权限，即可在 Nexlet 中运行你的插件。'}</p>
            </li>
          </ol>
        </div>
      </section>
      {'\n '}
      <section className="wide-shell plugin-capabilities">
        <div className="center-heading">
          <h2>{'能力有边界，扩展有余地。'}</h2>
          <p>{'Nexlet 提供一组清晰的桌面能力，让你的插件专注于创造真正有用的工具。'}</p>
        </div>
        <div className="capability-grid">
          <article>
            <div className="capability-heading">
              <span className="large-symbol">
                <Icon name="database" className="" />
              </span>
              <div>
                <h3>{'独立存储'}</h3>
                <p>{'为你的插件提供独立的数据存储空间，用于保存设置与用户数据。'}</p>
              </div>
            </div>
            <div className="api-label">
              <code>{'nexlet.storage'}</code>
              <CopyButton aria-label="复制存储 API" text="nexlet.storage">
                <Icon name="copy" className="" />
              </CopyButton>
            </div>
          </article>
          <article>
            <div className="capability-heading">
              <span className="large-symbol">
                <Icon name="clipboard" className="" />
              </span>
              <div>
                <h3>{'剪贴板文本'}</h3>
                <p>{'读取和写入当前系统剪贴板文本，让工具与更多场景打通。'}</p>
              </div>
            </div>
            <div className="api-label">
              <code>
                {'nexlet.clipboard.readText()'}
                <br />
                {'nexlet.clipboard.writeText()'}
              </code>
              <CopyButton aria-label="复制剪贴板读取 API" text="nexlet.clipboard.readText()">
                <Icon name="copy" className="" />
              </CopyButton>
            </div>
          </article>
          <article>
            <div className="capability-heading">
              <span className="large-symbol">
                <Icon name="external" className="" />
              </span>
              <div>
                <h3>{'打开外部链接'}</h3>
                <p>{'在默认浏览器打开 HTTP / HTTPS 链接。'}</p>
              </div>
            </div>
            <div className="api-label">
              <code>{'nexlet.openExternal()'}</code>
              <CopyButton aria-label="复制外部链接 API" text="nexlet.openExternal()">
                <Icon name="copy" className="" />
              </CopyButton>
            </div>
          </article>
        </div>
      </section>
      {'\n '}
      <section className="wide-shell plugin-bottom">
        <div>
          <article>
            <span className="large-symbol">
              <Icon name="box" className="" />
            </span>
            <div>
              <h3>{'隔离窗口与沙箱'}</h3>
              <p>{'独立窗口、上下文隔离，关闭 Node.js 集成。'}</p>
            </div>
          </article>
          <article>
            <span className="large-symbol">
              <Icon name="shield" className="" />
            </span>
            <div>
              <h3>{'权限在安装时确认'}</h3>
              <p>
                {'插件在安装时申请系统能力，你始终掌握控制权。'}
                <br />
                {'网络请求默认禁用，请将资源随包提供。'}
              </p>
            </div>
          </article>
        </div>
        <div className="plugin-start">
          <span className="large-symbol">
            <Icon name="code" className="" />
          </span>
          <div>
            <h2>{'从第一个便笺插件开始。'}</h2>
            <p>
              {'查看完整的示例项目，了解项目结构、核心 API'}
              <br />
              {'和实现思路，快速上手开发属于你的工具。'}
            </p>
            <a
              className="button primary"
              href="https://github.com/Cansiny0320/Nexlet/tree/main/examples/hello-nexlet"
            >
              {'打开示例项目 '}
              <Icon name="external" className="" />
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
