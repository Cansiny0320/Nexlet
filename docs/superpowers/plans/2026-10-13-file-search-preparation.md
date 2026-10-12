# 文件搜索准备实施计划

1. `tests/everything-engine.test.ts`、`tests/everything-search.test.ts`：先覆盖存活进程探测失败、已有二进制不覆盖、共享状态探测、不撤销搜索授权、准备/失败分类。运行针对性 Vitest，确认新增场景在旧代码失败。
2. `src/main/everything-engine.ts`：复制仅用于不存在的版本目录二进制，复用存活子进程，协调启动与停止，输出可理解的启动错误。
3. `src/shared/everything.ts`、`src/shared/types.ts`、`src/main/everything.ts`、`src/main/index.ts`：增加独立准备状态接口和共享探测；保留空关键词不执行用户搜索的语义。探测不写结果文件，不改变当前文件操作授权。
4. `src/renderer/FileSearch.tsx`、`src/renderer/filesearch.css`：打开/范围变更时准备、稳定状态动画与耗时、完成后检索当前关键词、忽略迟到响应、重试和后台复用；保留 Spotlight 行为。
5. `tests/electron.spec.ts` 和针对性 Electron 集成测试：调整旧的延迟启动断言，验证真实小目录空输入启动、重复打开、连续加载状态、失败重试和清空边界。更新 `assets/vendor/everything/README.md` 的启动说明。

## 验证命令与副作用

- `npm test -- tests/everything-engine.test.ts tests/everything-search.test.ts tests/file-search-mac.test.ts`：隔离 mock 单元测试；Vitest 可写本地缓存。
- `npm run typecheck`、`npm test`：类型与项目单元检查，不自动修复源文件。
- `npm run build`：生成 dist 构建产物。
- `npx playwright test tests/filesearch-preparation.spec.ts` 及已有文件搜索 E2E：在临时 userData 和小范围目录中启动独立 Electron/Everything，写测试产物，不接管用户安装版引擎。
- `git diff --check`：检查补丁格式。

## 风险与回滚

ES 只能提供是否已就绪的证据，不能保证实时扫描计数；展示准备状态和耗时。状态轮询必须和搜索授权、关键词代次隔离。现有用户引擎和数据库保持原样；回滚本次指定源文件及测试可恢复行为。没有用户授权的 commit、push、打包安装或发布步骤。

## 完成与验证记录

- 已完成以上实现。用修正后的测试 fixture 对照原引擎实现，复现 3 个回归失败，其中包含存活进程被重新复制导致 EBUSY；修复后通过。
- 最终针对性单元测试 20 项通过；实现过程中全量单元测试 149 项通过、2 项平台相关跳过，之后新增的慢启动回归包含在上述 20 项中。
- 构建通过。5 项文件搜索 Electron 集成测试通过，覆盖真实空输入启动、重开复用、版本探测失败时不覆盖程序、持续图标和耗时、最新关键词、空输入重试、迟到响应及受限文件操作。
- 首轮集成测试曾出现一次 IPC 来源拒绝，独立重跑和最终 5 项合跑均通过，未修改来源校验。工作区当时存在其他任务的并发产物变化，未证实其为该次错误原因。
- 全量 `npm run typecheck` 检查时在本次范围外新增的 `tests/windows-app-launch.spec.ts:31` 报 TS2322（ProcessEnv 含 undefined）；未修改该文件。使用 `.tmp/filesearch-verification/tsconfig.json` 仅排除该文件后类型检查通过。
- `git diff --check` 通过；截图 `.tmp/filesearch-verification/filesearch-preparing.png` 已检查。未提交、发布或更改用户当前安装版。
