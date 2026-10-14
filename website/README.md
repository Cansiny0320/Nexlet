# Nexlet 官网

正式地址：<https://nexlet.cansiny0320.chatgpt.site>

官网是独立的 `website/` 工程。2026-10-14 已按批准方案迁移为 React + TanStack Start SSR；本次为本地实现与验收，线上仍以实际部署版本为准。

## 技术栈与运行

- Node.js 24.19.0（最低 24.11.0）、pnpm 12.11.2、TypeScript 7.0.2。
- React 19.2.6、TanStack Start 1.169.1、TanStack Router 1.170.44。
- Vite+ 1.1.0（内含 Vite 8.3.3）、Sites Vite plugin 0.2.0、Cloudflare Vite plugin 1.37.1。
- Tailwind CSS 4.2.1、shadcn/ui base-nova 配置、Base UI 1.9.0、Lucide React。保留 Nexlet 现有视觉主题，Tailwind 不注入会改变原布局的 Preflight。
- Oxlint、Oxfmt、Vitest 5.0.3、Testing Library；Cloudflare Workers + 静态资源。

在 `website/` 中执行：

```powershell
pnpm install --frozen-lockfile
pnpm dev
pnpm verify
pnpm format:check
pnpm test:browser
```

使用 `packageManager` 指定的 pnpm 12.11.2；没有该版本时可用 `npx --yes pnpm@12.11.2 <命令>`。`verify` 包含 lint、类型检查、单元/组件测试与构建。首次 checkout 已包含生成路由树，构建或开发服务在路由变化时更新它。

`build` 写入 `dist/client`、`dist/server` 和 `dist/.openai/hosting.json`；Cloudflare 插件同时写本地 `.wrangler` 状态。`test:browser` 自动启动**构建后的 Worker**、运行 Chrome headless 测试并关闭进程，结果与截图写入忽略的 `.qa/`。先运行 build/verify。可用 `BROWSER_CHANNEL=msedge` 选择已安装的 Edge，或传 `SITE_URL` 使用已有预览。测试拦截 GitHub Release 与 Clipboard API，不下载安装包、不改系统剪贴板。`format` 会修改文件；其余检查不自动修复源码。

## 源码组织与行为

- `src/routes/`：首页、下载、插件开发和根布局；`src/router.tsx` 保留原路径及尾斜杠。
- `src/pages/`：React 页面内容；`src/components/`：共享布局、Base UI 下载菜单、复制按钮和版本展示。
- `src/components/site-provider.tsx`：同一页面共享下载状态。服务端与首次客户端渲染使用相同回退；浏览器挂载后识别平台、查询版本。
- `src/lib/platform.ts`、`src/lib/releases.ts`：纯平台判断、发布校验及超时请求。
- `src/lib/seo.ts`、`public/robots.txt`、`public/sitemap.xml`：SEO；`site.json` 保存正式 origin、仓库和事实核对日期。
- `src/styles/`：原有布局样式和 Tailwind / base-nova token 集成；`public/assets/`：图片、字体、图标与许可证。
- `src/server.ts`：TanStack Start 的 Worker 入口。没有登录、数据库、财务依赖或 oRPC。

`downloads.json` 保存已核实的完整回退版本和下载直链。首页和下载页在浏览器加载时向官方 GitHub latest Release 请求一次，5 秒超时，不携带认证、不自动重试。只有正式发布的 Windows x64 便携 EXE、macOS ARM64/x64 DMG 和 SHA256SUMS.txt 全部匹配同一版本，才整体更新版本、下载、更新日志和校验链接。失败仍可下载；客户端路由切换后也保留已确认版本，避免降级到更早版本。无 JavaScript 时保留静态回退直链。

未知平台或无法可靠判断的架构进入手动选择，macOS Intel UA 不代表实际 Intel 硬件。手动选择优先于晚到的架构识别，首页两处控件共享选择；切换选项不会开始下载。移动导航、菜单和复制反馈由 React 管理；Base UI 提供菜单焦点、方向键、Escape 和外部点击关闭。

三页均输出完整 SSR HTML，保留 canonical、OG、JSON-LD、公开 robots 和 sitemap；不存在的路径返回 HTTP 404 与 noindex。不要编造评分、下载数量或未发布功能。

## 资源与视觉

保留 `designs/2026-10-12-ui-v2/` 的设计基准与现有页面视觉。产品拼贴是功能示意；`launcher.png` 等保留既有截图身份。通用图标使用 Lucide React；品牌路径从 Simple Icons 11.0.0 原样迁入 `src/components/icon.tsx`，原始 viewBox 与 CC0 许可证保留。

字体仍为本地 Noto Sans SC 和装饰用 LXGW WenKai 子集，许可证随资源分发。可用 `scripts/build-font.py`、`scripts/build-note-font.py` 与 `fonttools[woff]` 重建，日常构建不需要 Python。

## Sites 发布边界

保留既有 `project_id`：`appgprj_6acbbb32d78881919f324dcdf9ee6640`。`.openai/hosting.json` 已移除静态站的 `static` 配置，构建产物改为 Worker；不要重新注册 Site。源码与本地构建验收不代表线上已发布。

发布需要单独授权。获得授权后，沿用 Sites 官方 `site-workflow.mjs` 的源码同步和打包流程；使用 `build-site.mjs` 运行本工程 build，保存其精确 commit/archive，保持既有 public audience，最后确认部署 succeeded。根仓库提交与 Sites source SHA 不要求相同，但网站源码应一致。不要把根仓库、桌面应用或本地 `.qa/`、`node_modules/`、`.wrangler/` 上传到 Sites 源码。

旧静态源码及 manifest 可从迁移前 Git 版本恢复；若后续发布，生产回滚可使用原 Sites 版本。本次没有 commit、push 或部署。

设计、计划和验收：`docs/specs/2026-10-14-tanstack-migration.md`、`docs/plans/2026-10-14-tanstack-migration.md`、`docs/validation-2026-10-14.md`。其他文档记录的是此前静态官网的历史状态。
