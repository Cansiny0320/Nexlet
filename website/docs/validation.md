# 官网验证记录

日期：2026-10-12（Asia/Shanghai）。范围仅限 website 官网。

## 本地验证

- `node website/scripts/build.mjs`：成功，生成四个静态页面、robots、sitemap、404 和共享资源。
- `node website/scripts/check.mjs`：通过；四页唯一 H1/title/description、canonical/OG、JSON-LD、UTF-8、图片尺寸与替代文本、68 个站内链接/资源、robots 和 sitemap。
- `node website/scripts/browser-check.cjs`：通过。系统 Microsoft Edge headless，宽度 1440、768、390、320 px；所有页面 HTTP 200，无整体横向溢出，滚动加载真实图片，无页面脚本错误。
- 键盘跳过导航、移动菜单展开、Esc 收起后焦点回到菜单、菜单导航、FAQ 键盘开合通过。关闭 JavaScript 后四页正文与导航仍可用。
- 实际查看桌面与手机全页截图和分享图；未观察到截断、遮挡或排版错位。桌面软件截图保留原始内容，低分辨率截图在官网适当缩放。

首次在交互 Node 运行器中直接导入项目 Playwright ESM，运行器未正确提供 CJS default export。改用标准 Node CLI 与项目现有 Playwright 成功；未修改根依赖。首轮图片检查误把未进入视口的 lazy 图片判为失败，改成真实滚动并等待图片解码后通过。

## 事实核对

- GitHub 仓库公开；核对时没有公开 Release。官网提供真实 Releases 与 Actions 链接，未虚构可下载版本。
- 已读取应用实现、Plugin API 文档、桌面验证记录与真实截图。Windows 本机验证、未签名；macOS CI 构建与真机使用验收分开描述，保留 ad-hoc、未公证及辅助功能权限说明。
- 初始 CI 运行 38155660444 失败；新的运行 38156530040 在核对时进行中。因此官网不宣称所有平台构建或功能验收通过。
- 其他会话中的 JSON、市场与许可改动尚在推进；官网仅说明已核实能力。后续版本应随产品实际发布更新。

## 验证边界

上述检查验证基本响应式与键盘可访问性，不代表完整 WCAG 合规审计。搜索引擎实际收录、AI 引用和排名尚未验证，也无法由上线保证。未建立 Search Console 所有权或提交站点索引。

公开发布与匿名回读结果在完成后记录于 `deployment.md`。
