# macOS 文件搜索实施计划

设计：`docs/superpowers/specs/2026-10-12-macos-file-search.md`。仅修改本任务文件，保留已有 website 改动。

1. 新增 `src/shared/spotlight.ts`、`tests/spotlight.test.ts`：先验证中文、多关键词、引号、通配符、扩展名、非法输入和表达式转义，再实现查询转换。
2. 新增 `src/main/spotlight.ts`、`tests/spotlight-search.test.ts`：执行 mdfind，按范围查询、去重、限制 200 条、读元数据，处理超时、取消、退出和文件消失。修改 `src/main/everything.ts` 按平台分派，保留文件操作白名单，清除过期授权；覆盖窗口隔离、新旧查询、reset 和 forget。
3. 修改 `src/renderer/FileSearch.tsx`、`src/renderer/Settings.tsx`：macOS 专属提示与范围设置，复用交互。更新受影响的跨平台测试选择器；新增 macOS Electron 场景验证真实 Spotlight 结果、设置、键盘选择、文件操作和无结果提示。
4. 验证：先运行新增 focused Vitest 测试观察失败，再实现并通过；`npm run typecheck`、`npm test`、`npm run build`、针对性的 Playwright 文件搜索及窗口分离验证、`git diff --check`。build 生成本地 dist，Playwright 使用隔离 userData 并写 test-results；真实 Spotlight 验证优先使用已被索引的系统文件，避免测试依赖新文件异步索引。文件操作测试记录 shell 调用目标，复制路径验证后恢复剪贴板。

风险：系统索引覆盖不完整、异步索引造成测试不稳定、查询取消后旧结果恢复授权、不同平台提示影响现有测试。通过明确空结果提示、已索引 fixture、过期查询测试和平台化选择器覆盖。

回滚：仅撤销本次新增文件及已有文件的本次 hunks，不动 website 工作区；不改变系统 Spotlight 设置，没有数据迁移。无需远端写入或发布。

## 完成与验证记录

- 已完成上述实现和 README 使用说明；未进行 commit、push、安装包构建或发布。
- Node 24.19.0：文件搜索 focused 测试 25 项通过；全量 Vitest 当次 25 个文件、139 项通过。终端默认 Node 20 缺少 `node:sqlite`，验证时改用本机已有 Node 24，没有修改系统 Node 配置。
- `npm run typecheck`、本地 build、`git diff --check` 通过。构建保留已有大 chunk 提示。
- `tests/filesearch-mac.spec.ts` 的 3 项 Electron 测试通过，真实调用 Spotlight 搜索系统应用，验证范围设置、多关键词/扩展名、复制路径、键盘选择、清空及目录切换后的权限失效；打开和 Finder 定位通过记录 Electron shell 调用目标验收，未启动目标应用或 Finder。
- `tests/alignment.spec.ts` 的文件搜索窗口恢复测试通过。截图：`test-results/filesearch-mac.png`。
- 验证期间其他工作同时写入插件功能和相关测试，初次全量检查出现缺少插件模块的错误，未改动这些文件；其补齐后重新检查通过。
- 初次剪贴板恢复使用了 Electron 不接受的读取对象而失败；测试已改用新构造的 ClipboardItem，后续验证恢复成功。首次失败前的原剪贴板内容未能恢复，剪贴板可能保留测试路径。
