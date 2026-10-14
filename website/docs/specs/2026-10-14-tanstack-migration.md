# 官网技术栈迁移设计

批准日期：2026-10-14。依据用户批准的会话方案与 Space「资产管理应用」；参照发布提交 `cd52f7f94827d0479def2275e441034e67995f78`。

## 范围与架构

仅迁移 `website/`，使用 React 19.2.6、TanStack Start 1.169.1 SSR、TanStack Router 1.170.44、TypeScript 7.0.2、Vite+ 1.1.0、pnpm 12.11.2、Tailwind CSS 4.2.1、shadcn/ui base-nova / Base UI 1.9.0、Lucide。检查使用 Oxlint、Oxfmt、Vitest 5 和 Testing Library。

保留 `/`、`/download/`、`/plugins/`、现有文案、视觉布局、本地字体与图片、公开访问、Sites 项目标识。构建改为 Cloudflare Workers SSR + 静态资源，移除 hosting manifest 的 static 字段。官网无数据库、登录或内部业务 API，不迁入财务依赖、D1、oRPC 或认证。

路由负责 metadata 与页面；共享 React 组件负责导航、展示和下载选择；纯函数处理平台与 Release 校验；React provider 统一同一页面的下载状态。平台检测只在浏览器 hydration 后运行；服务端输出稳定的回退版本和完整正文。

## 行为合同

- 首页两处下载按钮共享选择。用户手动选择优先于晚到的系统识别；不确定架构保留平台选择入口。选择平台不开始下载。
- 浏览器每次页面加载最多请求一次 GitHub latest Release，超时 5 秒，无认证、无自动重试。只有同一正式发布的 Windows x64 便携 EXE、两个 macOS DMG 和校验文件全部有效才整体更新版本及链接。失败保留 downloads.json 的完整回退。
- 无 JavaScript 时正文、导航、平台直链、校验链接和 FAQ 仍可用。客户端菜单、复制、快捷键标识由 React 状态维护。
- 保留唯一标题、description、canonical、OG、JSON-LD、robots.txt 和 sitemap.xml；未知路径返回真正的 404。

## 验收与风险

复用原平台/Release 用例，增加 React 异步竞争、手动选择和 SSR 回退覆盖。验证类型、lint、格式、测试与真实 Worker 构建；浏览器检查三条路由直接访问/刷新/导航、无脚本、下载失败、键盘操作、复制反馈、320–1440px 布局及控制台错误。

主要风险是 hydration 不一致、CSS reset 改变视觉、Worker 产物不符合 Sites 合同。以稳定 SSR 初值、保留原视觉样式并引入 Tailwind 分层、检查部署元数据和运行构建后 Worker 处理。未授权部署；构建成功不等于线上已迁移。

回滚限于本次 website 改动：从迁移前 Git 版本恢复官网源码、静态 manifest 和静态产物即可。部署若另获授权，可回退既有 Sites 版本。不得覆盖其他并行改动。
