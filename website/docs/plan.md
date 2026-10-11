# 官网实施计划

依据：已批准的 `spec.md`。实现、官网范围提交/推送、Sites 公开部署已授权。

## v2 重做计划

1. 保存最后的分体下载按钮设计图。重构 `src/pages.mjs`、`assets/site.css` 和共享构建模板，按四张批准稿重建页面。新增轻量 SVG 图标和 HTML 产品示意组件，维持真实语义正文与可抓取的元数据。
2. 为系统识别新增独立 helper 与 Node 测试；验证 Windows/macOS 两种架构、信息缺失、移动设备、拒绝识别、迟到响应与手动选择优先。`assets/site.js` 实现分体下载菜单、键盘/Esc/外部点击关闭、选择同步、复制路径和 FAQ。
3. 从已成功的 CI 下载 0.1.0 三个平台原始产物及已有 SHA256SUMS，核对来源与文件哈希。按用户本次授权创建公开预览 Release，保留 Windows 未签名、macOS ad-hoc 未公证与真机使用验收限制。`downloads.json` 记录真实稳定直链。
4. 生成页面并运行静态、行为和浏览器检查。在设计图原始宽度（首页 1065，其余 1107）逐页截图对比；保留对照页面和观察记录。针对差异修正，不只检查无报错。另验证 320/390/768/1440 响应式、无 JavaScript 下载和完整键盘流程。
5. 只提交 website 的本次修改并推送，按精确提交导出到既有 Sites 临时源仓库。修复 Windows tar 对 C: 的远程主机误判（为该发布进程设置 TAR_OPTIONS=--force-local），使用现有 Site ID 与 public 访问，不重复注册。发布成功后匿名回读页面及安装包真实响应。

旧版步骤以下仅保留实施历史；v2 设计和步骤优先。没有新增设计审批点。

1. 建立静态页面和资源：`dist/index.html`、`dist/download/index.html`、`dist/privacy/index.html`、`dist/plugins/index.html`、共享 CSS/JS 与真实截图。主标题为“常用工具，随叫随到”。用原生 HTML 保持无 JavaScript 可读。
2. 维护与发布配置：`.openai/hosting.json`、`README.md`、必要 Node.js 脚本。注册 Site 后立即持久化真实 project_id。canonical、OG、sitemap 使用返回的真实域名；发布内容仅 dist。
3. 验证：运行 `node website/scripts/check.mjs` 检查静态内容与链接；本地静态服务器通过 `node website/scripts/serve.mjs` 启动，浏览器检查 1440、768、390、320 px，键盘、菜单、关闭 JavaScript；检查只读，不使用自动修复。验证产物写入 website 内忽略目录。
4. 事实复核：从 GitHub Release 和实际代码确认预览、平台、插件状态。所有限制与页面说明一致；不把 CI 通过扩大为全部功能真机验证。
5. 在共享仓库只暂存 website 的明确文件并核实 staged diff，然后提交/推送。用提交中的官网文件在主仓库外同步到 Sites 源仓库，由 Sites helper 提交/推送/打包。不得更改主仓库 origin 或创建嵌套仓库。
6. 将 audience 设为用户指定的 public，保存并部署相应版本。等待 succeeded 后匿名检查页面、robots.txt、sitemap.xml、元数据与图片。写入实际验证和发布记录，并交付 URL、提交和限制。

静态检查验证有意义的回归边界，不为纯样式增加复述实现的单元测试。浏览器检查验证真实页面布局与交互。源文件 UTF-8；现有桌面文件不改动。回滚方式见 spec。
