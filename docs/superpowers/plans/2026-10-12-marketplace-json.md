# 实施计划

依据 `../specs/2026-10-12-marketplace-json-design.md`。用户已批准，无新增审批点。

1. `src/main/catalog*.ts`、`tests/catalog-icons.test.ts`：解决 lnk 通用图标及 UWP 图标缺失；使用真实 Chrome/微信/VS Code/记事本检索和测试快捷方式，验证图标像素与目标一致，失效图标仍保留条目。
2. `scripts/smoke-portable.mjs`、必要的 `src/main/index.ts`：定位 CI 便携包超时，收集渲染状态并修复真实原因；不能仅延长超时掩盖失败。三平台 CI 要达到成功。
3. `src/shared/marketplace.ts`、`src/main/marketplace.ts`、`src/main/plugins.ts`、`src/shared/types.ts`、`src/renderer/Plugins.tsx`：索引合同、GitHub 拉取与缓存、安装/更新事务、来源展示、预装列表及市场 UI。保留既有隔离/权限流程；新增相应核心和桌面集成回归。
4. 独立目录 `D:/code/Nexlet-plugins`：建立公开插件仓库，提供索引、便笺插件源码、图标、MIT LICENSE、说明和可重复打包的 workflow。提交并发布实际插件包，回读公开索引，再由 Nexlet 实际安装验证。
5. `src/shared/json-tools.ts`、`src/renderer/JsonTool.tsx`、样式和命令入口：JSON 双栏高亮编辑、解析树、折叠、格式化/压缩、复制、错误位置；JSON diff 对象键排序选项和数组顺序语义。使用有边界的严格解析，测试大整数和深度限制。
6. `src/main/everything.ts`、`src/renderer/FileSearch.tsx`、共享类型与 host IPC、`assets/vendor/everything/`：使用官方 ES 文件搜索；固定 CLI 参数、超时、结果数量、可选平台、状态提示，打开操作限定已返回路径。保留 ES 原始许可证，记录官方来源版本。
7. `README.md`、`LICENSE`、`CONTRIBUTING.md`、`docs/plugin-sdk.md`、`docs/validation.md`：文档与真实最终能力一致，MIT 许可，真实截图和下载状态。官网目录不由本会话修改。
8. 验证命令：`npm run typecheck`、`npm test`、`npm run test:e2e`、`npm run package:win`、打包 smoke、`actionlint`、`git diff --check`；命令会生成 dist/release/test-results/.tmp，GitHub CI 会下载构建依赖并上传构建 artifacts。推送按用户授权执行，只暂存本会话文件。

失败时保留诊断并修复本次范围内问题。网络请求仅用于公开插件仓库、官方依赖及 GitHub；不上传用户 JSON、文件查询结果或剪贴板。
