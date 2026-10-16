# Windows 目录缓存实施计划

依据已批准设计：`docs/superpowers/specs/2026-10-16-windows-catalog-cache.md`。在当前 checkout 实施，保留本次先前的快捷方式过滤改动。

1. 新增 `src/main/catalog-cache.ts` 与 `tests/catalog-cache.test.ts`：独立 SQLite 快照/图标存储、严格读取验证、容量回收、损坏恢复与不可写降级。先验证失败再实现。退出关闭数据库。
2. 更新 `src/main/catalog-icons.ts`，复用 Windows 图标来源解析并计算资源指纹；扩展相关单元测试，验证目标/自定义资源变化及错误边界。
3. 更新 `src/main/catalog.ts`，增加启动恢复、事务式扫描提交、指纹复用、失败保留、串行最新扫描与过期图标响应保护；`tests/catalog-cache-lifecycle.test.ts` 覆盖恢复、增删、别名、并发与失败。
4. 更新 `src/main/index.ts`、`src/shared/types.ts`、`src/renderer/Launcher.tsx`：Windows 启动恢复，退出关闭缓存，语言/路径变更触发刷新，目录版本同步前端图标缓存。保留原图标 IPC 数组接口，条目携带版本。
5. 新增 `tests/catalog-cache.spec.ts`，以独立临时用户数据和真实 `.lnk` 验证跨进程恢复、后台更新与损坏恢复；复用快捷方式去重、图标 UI E2E。

验证命令：

- `node node_modules/vitest/vitest.mjs run --config vitest.config.ts tests/catalog-cache.test.ts tests/catalog-cache-lifecycle.test.ts tests/catalog-icons.test.ts tests/catalog-dedup.test.ts`
- `node node_modules/typescript/bin/tsc --noEmit`
- `node node_modules/vitest/vitest.mjs run --config vitest.config.ts`
- `node scripts/build.mjs`（生成本地 `dist/`，不发布）
- `node node_modules/@playwright/test/cli.js test tests/catalog-cache.spec.ts tests/catalog-dedup.spec.ts tests/catalog-icons.spec.ts --workers=1`（启动独立测试进程，写 `.tmp/` 与 `test-results/`，不修改已安装版数据）
- `git diff --check`

失败先区分本次引入与既有问题；只修复本次范围。验收通过后记录结果，不自动 commit/push/安装。回滚仅撤回缓存模块及接入，保留之前的过滤改动；独立缓存文件可重建。

## 执行结果（2026-10-16）

- 五项实施步骤已完成。另在 `src/renderer/App.tsx` 拒绝目录版本较旧的状态响应，避免整个列表回退。
- 最终全量 Vitest：69 个文件通过、2 个跳过；471 项通过、4 项跳过，包含空快照失败保留和退出时异步图标保护。
- 最终 `tsc --noEmit`、本地构建和 `git diff --check` 通过。
- Windows Electron：缓存重启/更新/损坏恢复、快捷方式去重/过滤、全量及最近使用图标三项通过；macOS 原生图标项因平台跳过。
- 缓存重启测试在第二次启动时仅暂停自动扫描以验证恢复首帧，随后显式执行真实扫描；第三次启动不暂停，验证损坏数据库后的自动扫描恢复。
- 首次缓存 E2E 在创建自定义图标夹具时失败：`shell.writeShortcutLink` 必须同时传 `icon` 与 `iconIndex`，缺少后者导致真实 `.lnk` 未保存图标位置。核对安装的 Electron 类型文档及实际快捷方式字段后补齐，重跑通过。
- 已检查 `test-results/catalog-cache-refreshed.png`：刷新后显示新绿色图标，被删除的入口已移除。测试使用独立临时用户数据，未更改已安装 Nexlet 的程序或数据。
- 实现验收后，用户授权提交并推送一个发版 commit：同步 `package.json`、`package-lock.json` 为 `0.2.31`，更新 `docs/release-notes.md`；不额外推送标签或发布 Release，不安装本机应用。
