import { documentLink } from '../lib/i18n';
import { useSiteTranslation } from '../components/site-language';
import { Icon } from '../components/icon';
import { CopyButton } from '../components/copy-button';
export function PluginsPage() {
  const { t, locale } = useSiteTranslation();

  return (
    <>
      <section className="shell plugins-hero">
        <div className="plugins-intro">
          <h1>{t('插件开发')}</h1>
          <p>{t('用 HTML、CSS 和 JavaScript 构建桌面工具。')}</p>
          <div className="actions">
            <a
              className="button primary"
              href={documentLink(
                'https://github.com/Cansiny0320/Nexlet/blob/main/docs/plugin-sdk.md',
                locale,
              )}
            >
              {t('阅读开发文档 ')}
              <Icon name="external" className="" />
            </a>
            <a
              className="button secondary"
              href="https://github.com/Cansiny0320/Nexlet/tree/main/examples/hello-nexlet"
            >
              {t('查看示例 ')}
              <Icon name="external" className="" />
            </a>
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
                <code className="code-comment">{t('// 你的插件，从这里开始')}</code>
              </li>
              <li />
            </ol>
          </div>
          <div className="sample-plugin">
            <div className="mock-title">
              <span className="brand-symbol">{'N'}</span>
              <strong>{t('示例便笺')}</strong>
              <span>{'−   ×'}</span>
            </div>
            <p>{t('一个顺手的小工具。')}</p>
            <CopyButton className="button primary" text={t('一个顺手的小工具。')}>
              {t('复制内容')}
            </CopyButton>
          </div>
        </div>
      </section>
      {'\n '}
      <section className="wide-shell plugin-directory">
        <div className="file-tree">
          <h3>
            <Icon name="folder" className="" />
            {t('我的插件 ')}
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
          <h2>{t('开发流程')}</h2>
          <ol className="plugin-steps">
            <li>
              <h3>
                <span>{'1'}</span>
                {t('编写界面')}
              </h3>
              <p>
                {t('使用你熟悉的 HTML、CSS')}
                <br />
                {t('和 JavaScript，构建插件界面与功能逻辑。')}
              </p>
            </li>
            <li>
              <h3>
                <span>{'2'}</span>
                {t('加载开发目录')}
              </h3>
              <p>{t('在 Nexlet 中选择你的插件目录，重新打开窗口即可预览文件改动。')}</p>
            </li>
            <li>
              <h3>
                <span>{'3'}</span>
                {t('确认权限并运行')}
              </h3>
              <p>{t('根据插件需要确认所需权限，即可在 Nexlet 中运行你的插件。')}</p>
            </li>
          </ol>
        </div>
      </section>
      {'\n '}
      <section className="wide-shell plugin-capabilities">
        <div className="center-heading">
          <h2>{t('插件 API')}</h2>
        </div>
        <div className="capability-grid">
          <article>
            <div className="capability-heading">
              <span className="large-symbol">
                <Icon name="database" className="" />
              </span>
              <div>
                <h3>{t('独立存储')}</h3>
                <p>{t('保存插件设置与数据。')}</p>
              </div>
            </div>
            <div className="api-label">
              <code>{'nexlet.storage'}</code>
              <CopyButton aria-label={t('复制存储 API')} text="nexlet.storage">
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
                <h3>{t('剪贴板文本')}</h3>
                <p>{t('读取或写入系统剪贴板文本。')}</p>
              </div>
            </div>
            <div className="api-label">
              <code>
                {'nexlet.clipboard.readText()'}
                <br />
                {'nexlet.clipboard.writeText()'}
              </code>
              <CopyButton aria-label={t('复制剪贴板读取 API')} text="nexlet.clipboard.readText()">
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
                <h3>{t('打开外部链接')}</h3>
                <p>{t('在默认浏览器打开 HTTP / HTTPS 链接。')}</p>
              </div>
            </div>
            <div className="api-label">
              <code>{'nexlet.openExternal()'}</code>
              <CopyButton aria-label={t('复制外部链接 API')} text="nexlet.openExternal()">
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
              <h3>{t('隔离窗口与沙箱')}</h3>
              <p>{t('独立窗口、上下文隔离，关闭 Node.js 集成。')}</p>
            </div>
          </article>
          <article>
            <span className="large-symbol">
              <Icon name="shield" className="" />
            </span>
            <div>
              <h3>{t('权限在安装时确认')}</h3>
              <p>{t('网络请求默认禁用，请将资源随包提供。')}</p>
            </div>
          </article>
        </div>
        <div className="plugin-start">
          <span className="large-symbol">
            <Icon name="code" className="" />
          </span>
          <div>
            <h2>{t('运行示例插件')}</h2>
            <p>{t('查看便笺插件的源码与运行步骤。')}</p>
            <a
              className="button primary"
              href="https://github.com/Cansiny0320/Nexlet/tree/main/examples/hello-nexlet"
            >
              {t('打开示例项目 ')}
              <Icon name="external" className="" />
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
