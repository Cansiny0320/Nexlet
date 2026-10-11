# 官网 v2 验证记录

日期：2026-10-12（Asia/Shanghai）。范围：website 四页、下载入口与官网发布。桌面 0.2.0 工作由另一会话完成，不作为本次 0.1.0 安装包内容。

## 设计稿逐页对照

基准为 `designs/2026-10-12-ui-v2/`；首页使用最终 `01-home-system-download.png`。以首页 1065 px、其余三页 1107 px 原图宽度生成完整截图，逐页人工检查标题、卡片构图、边距、插画、导航、下载菜单与页脚。

- 首页：居中双行标题、单个分体下载按钮、三窗口产品示意、三列工具卡片、两张说明卡和浅紫下载区。默认收起菜单，另截取展开状态对照设计。
- 下载页：双平台卡、macOS 两种架构、真实 Release 附件链接、三步入门、四项 FAQ 与源码入口。
- 隐私页：本机目录图、三项摘要、目录导航、存储路径与复制、500 条 / 30 天 / 收藏规则、权限与备份。官网访问说明通过目录展开，保留默认设计构图。
- 插件页：深色代码窗、便笺叠层、文件树与三步开发、三张能力卡、安全说明和示例入口。

已根据实测修正初版间距、正文偏小、平台菜单位置、背景曲线、平板/手机横向溢出和手机装饰遮盖标题。对照截图保存在 `.qa/`，可运行 `node website/scripts/visual-comparison.mjs` 生成并排/叠加对照页。

图中为生成式光栅稿；网页使用可选中、可抓取的真实 HTML、CSS 与 SVG。字体轮廓、手写装饰、图标和柔光细节仍有像素差异，未将人工检查声称为逐像素一致。API、权限、版本及安装说明以实际产品为准，修正图中不准确的小字。

## 自动化检查

- `node website/scripts/build.mjs`：四页、robots、sitemap、404 和资源构建成功。
- `node website/scripts/check.mjs`：四页唯一 H1/title/description、canonical、OG、JSON-LD、UTF-8、70 个本地链接与资源检查通过。
- `node --test website/tests/platform.test.mjs`：4 项测试通过。Windows x64、已知 macOS 架构、macOS Intel UA 歧义、移动设备、未知/ARM Windows 与 32 位回退。
- `node website/scripts/browser-check.cjs`：Microsoft Edge headless；四页在 1065、1107、1440、768、390、320 px 下均无页面横向溢出和脚本错误。验证跳过导航、移动菜单、Esc 焦点恢复、下载下拉键盘选择、全页按钮同步、外部点击关闭、手动选择优先于迟到识别、拒绝架构识别与已知 ARM Windows 回退、路径复制、FAQ、无 JavaScript 导航与三个直接下载链接。
- 浏览器报告和截图写入 `.qa/`，不随发布产物上传。

## 真实下载核对

公开预览版：[v0.1.0](https://github.com/Cansiny0320/Nexlet/releases/tag/v0.1.0)。源提交 `6277f6782f194cd8c1b23eeaa7ae4e722f4136e0`，来自成功的 CI run `38157028460`，不从 0.2.0 工作目录重打包。

三个安装包和示例插件在上传前核对 CI 的 `SHA256SUMS.txt`，上传后 GitHub asset digest 与本地 SHA-256 一致。三个匿名直链实际进行 Range GET，均返回 HTTP 206、application/octet-stream、64 字节，逐字节匹配原始产物开头；这验证直链指向正确附件，不替代各平台真实安装与使用验收。

Windows 未签名；macOS ad-hoc 签名且未公证。CI 构建、打包后启动通过，macOS 真机交互和最低系统版本未作全面验收。

## 验证边界

未进行完整 WCAG 合规审计；搜索引擎收录、排名和 AI 引用无法由部署保证。实际发布结果与匿名回读记录见 `deployment.md`。
