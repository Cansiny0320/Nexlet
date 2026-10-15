# i18n 本地验收记录

日期：2026-10-15。范围：Nexlet 桌面、官网、公开文档及相邻 Nexlet-plugins 仓库。已完成本地实现和验证，未 commit、push、发布、部署或替换日常安装版本。

## 实现范围

- 桌面支持 `zh-CN`、`zh-Hant`、`en`，默认跟随系统；设置持久化，主窗口、独立工具、超级面板、托盘和插件随语言更新。切换保留输入、编辑器实例及插件会话。命令 ID、协议、用户内容和系统 locale 含义不变，搜索保留三语与拼音别名。
- 官网保留中文路径，新增 `/en/`、`/zh-Hant/` 三个页面，共 9 个页面路由；SSR、语言导航、SEO、hreflang、sitemap、404、产品示意和分享图片同步。繁体字体子集包含所有当前界面汉字，并附字体授权。
- `README.md` 默认中文，英文、繁体版本互链。公开 SDK、扩展 API、Linux、贡献说明、官网、插件仓、SDK 和模板文档提供对应语言版本。历史验收及上游 vendor 文档保留原文。
- 便笺、字数统计和翻译支持三语。Ctool 跟随宿主使用上游英文或简体中文，繁体回退简体；适配层错误提示也跟随语言。未修改上游归档。

## 自动验证

| 范围 | 命令与结果 |
| --- | --- |
| 桌面类型、单元和构建 | `npm run typecheck`、`npm test`、`npm run build` 通过；63 个测试文件、462 项单元测试通过 |
| 桌面交互回归 | `npm exec -- playwright test tests/i18n.spec.ts tests/settings-ui.spec.ts tests/backspace-navigation.spec.ts tests/scratchpad.spec.ts tests/translation.spec.ts`：20 项通过，1 项真实 Google 联网测试按默认配置跳过 |
| SDK 与超级面板 | `npm exec -- playwright test tests/i18n.spec.ts tests/plugin-sdk.spec.ts tests/super-panel.spec.ts`：10 项通过；其中 2 项语言测试与前组重复，不叠加计数 |
| 插件类型和单元 | `npm run typecheck`、`npm test` 通过；23 项测试通过 |
| 自有插件构建与宿主 | 三个插件构建成功；`npm run test:e2e` 字数统计打包安装和交互通过；`npm run test:i18n:e2e` 验证全部 4 个插件三语切换、输入保留及系统 locale 不变 |
| Ctool | `npm run typecheck:ctool`、`npm run package:ctool`、`npm run test:ctool` 通过；10 项单元测试。`npm run test:ctool:e2e` 覆盖 50 个工具、74 个功能页面及 HTTP/WebSocket/文件等能力；后续仅适配层提示翻译与路径修正，重新通过打包、10 项单元及四插件语言验证 |
| 官网 | `pnpm verify`、`pnpm format:check`、`pnpm test:browser` 通过；18 项单元测试、14 项构建产物浏览器测试，覆盖全部 9 个语言页面及 320 / 390 / 1440 宽度 |

语言用例覆盖系统语言解析、旧配置、缺词回退、插值参数、英文单复数、搜索别名、可选 manifest 元数据、语言事件初始读取竞争、重启持久化及独立窗口同步。JSON 编辑器曾在语言切换时重建实例，已先复现再改为 compartment 更新标签。macOS 自启动“等待系统批准”曾依赖中文提示判断，已先用英文和繁体回归复现，再改为系统状态判断。

资源审计检查了 1,418 处静态中文 `t()` / `translate()` 调用，无缺失英文词条；资源测试同时检查繁体覆盖及插值参数。文档本地链接检查 199 条无缺失。两个仓库 `git diff --check` 通过。

## 人工检查和限制

检查了英文、繁体启动器和设置页、官网窄屏及分享图片。新增截图在 `docs/screenshots/en/` 和 `docs/screenshots/zh-Hant/`；抓取使用隔离的临时用户数据及样例内容，插件市场截图使用本仓目录样例。可通过 `scripts/capture-i18n.mjs` 与 `website/scripts/capture-i18n.mjs` 复现。

真实 Electron / 原生验证在 macOS 进行，未执行 Windows / Linux 原生运行或正式安装包验收。第三方插件内部界面、上游原始诊断、用户文本和历史记录不自动翻译。Google 真实联网测试未启用；翻译交互和错误处理由测试响应验证。构建存在已有的大 chunk / OCR 和 Ctool 上游构建警告，无构建错误。

临时官网预览服务已关闭。正式跨平台构建、版本发布和官网部署仍需后续明确授权及对应验收。
