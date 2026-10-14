# 官网技术栈迁移验收

日期：2026-10-14（Asia/Shanghai）。结果：本地实现与验证通过；未 commit、push 或部署。

## 版本与基线

目标来自 Space「资产管理应用」及其 GitHub 发布源码 `cd52f7f94827d0479def2275e441034e67995f78`，不是本机尚未更新的 Vinext checkout。

最终验证使用 Windows、Node.js 24.19.0、pnpm 12.11.2、TypeScript 7.0.2、Vite+ 1.1.0 / Vite 8.3.3。React、TanStack Start/Router、Tailwind、Base UI、Sites/Cloudflare plugin 版本见 package.json 与锁文件。

迁移前 12 个 Node 平台/Release 测试通过；原静态检查通过三页面及 42 个本地链接/资源，metadata、JSON-LD、robots、sitemap 正常。迁移前后 390px / 1440px 截图保存在 `.qa/baseline/` 与 `.qa/migrated/`；已人工核对主要布局、文案和视觉。资源迁移时逐个核对 SHA-256，图片与字体内容保持一致；Lucide 许可证更新为安装版本附带的许可证。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 通过，锁文件可复现安装 |
| `pnpm peers check` | 通过，无 peer dependency 问题 |
| `pnpm verify` | 通过：Oxlint、tsc、15 个单元/组件测试、客户端与 Worker 构建 |
| `pnpm format:check` | 通过，42 个匹配文件格式正确 |
| `pnpm test:browser` | 12 个场景全部通过，运行于实际构建后的 Cloudflare Worker |
| Sites 官方 `build-site.mjs` | 通过，生成 Worker、客户端静态资源与部署元数据；未打包上传或部署 |
| `git diff --check` | 通过 |

Vite+ 的 vite alias 包版本为 1.1.0，其运行时实际导出 Vite 8.3.3；pnpm workspace 对该精确版本设置 peer 兼容规则。工具输出中的代理环境提示来自本机代理；Oxlint 无代码告警。依赖安装提示 TanStack 的附加 agent skills 待批准，本次没有启用这些附加技能，也不影响应用构建。

## 浏览器覆盖

- 三路由完整 SSR、唯一标题/description、canonical、OG、JSON-LD、本地资源、robots/sitemap 与 HTTP 404 + noindex。
- 客户端路由切换后等待懒加载页面和 metadata 提交，确认 canonical 与当前导航正确；每页刷新成功，无 hydration 或控制台错误。
- 下载版本、三种安装包、更新日志与 SHA-256 链接同时更新；拒绝限流、网络错误、无效 JSON、附件不完整的 Release；保留完整回退版本。
- 手动选项不被晚到的架构识别覆盖，首页两处按钮共享选择；未知平台保持选择入口。
- macOS / Windows / iPad 桌面模式的快捷键标识，移动导航、skip link、Escape 焦点归还、菜单方向键与外部点击关闭、键盘 FAQ。
- 复制成功与失败反馈使用 mock Clipboard API，不改系统剪贴板。
- 禁用 JavaScript 后三页正文与导航可见，下载页保留三种直链和对应校验链接。
- 320、390、768、1065、1107、1440px 下三页没有横向溢出；失败文案不遮挡首页示意图。

初轮浏览器测试发现 Base UI Menu 缺少 Portal，已根据安装包源码确认并修复；其后完整浏览器回归通过。测试还修正了把 URL 提交误当作懒加载页面与 metadata 已完成的等待条件。

## 构建与交付边界

产物为 `dist/client/`、`dist/server/index.js`、`dist/server/wrangler.json` 与 `dist/.openai/hosting.json`，保留原 Site ID，移除旧静态配置。源码保留 `src/routeTree.gen.ts` 以支持干净 checkout 直接类型检查，生成产物与本地状态目录均忽略。

旧资源与旧静态产物移到本地忽略的 `.qa/legacy-assets/`、`.qa/legacy-dist/`，Git 中以删除旧路径、新增迁移路径呈现。范围仅为官网源码与文档，不涉及桌面应用实现。正式发布需要单独授权；本次没有验证新的线上部署或触发真实下载。

收尾已停止本次启动的旧静态预览和 Worker 测试预览；检查的本地预览端口没有残留监听。最后官方构建与浏览器通过时的应用 bundle 文件名/大小一致，更新后的 Lucide 许可证已核对源文件和构建输出哈希一致。
