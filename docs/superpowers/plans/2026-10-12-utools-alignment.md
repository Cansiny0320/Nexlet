# uTools 行为对齐实施计划

依据：`../specs/2026-10-12-utools-alignment-design.md`，两批均已获准，在当前会话执行。

## 基线

- 保留现有 README、validation、package.json、platform.ts 和本地签名文档/脚本/测试改动。
- Node 24.19.0：`npm run typecheck` 通过；`npm test` 70 passed / 4 skipped（平台条件）。
- 检查命令：typecheck 只读；Vitest 使用隔离临时目录；build 写 dist；Playwright 写 .tmp/test-results 并启动隔离 Electron，必要的剪贴板测试保存/恢复原内容，不注册系统启动项、不联网发布。

## 1. 输入合同与匹配（先测试，再实现）

文件：`src/shared/types.ts`、新增 `src/shared/launch.ts`、`src/shared/plugin-validation.ts`、新增 `src/main/content-matcher.ts`/worker、`scripts/build.mjs`、新增匹配/manifest 测试。

行为：可选 feature matches，旧合同不变；统一内置与插件候选；worker 正则预算、取消、去重和输入代次。先覆盖正常条件、非法正则、恶意回溯、新查询取消旧查询、排序。

验证：focused Vitest + typecheck；证明普通搜索不被恶意规则拖住、文件条件取交集且空输入不匹配。

## 2. 输入资源与启动器接入

文件：新增 `src/main/launch-input.ts`，`src/main/index.ts`、`src/renderer/App.tsx`、`src/renderer/Launcher.tsx`、`src/renderer/styles.css`、host preload 白名单，资源测试及 E2E。

行为：宿主管理输入 ID 和资源 token，renderer 只选择候选；输入 chip、取消、关键词过滤；明确选择「收进剪贴板」才写；选择插件才授予会话读权限。宿主验证资源大小、真实路径及文件身份。

验证：隔离临时文件单测，Electron 文本/文件/图片输入，断言系统剪贴板不变、旧输入不可启动、资源未授权/失效拒绝。

## 3. 外部插件会话与内嵌/分离

文件：`src/main/plugins.ts`、必要的会话 helper、`src/main/index.ts`、`src/preload/plugin.ts`、`src/shared/types.ts`、renderer 宿主标题栏；新增插件会话 E2E，更新旧窗口假设的现有测试。

行为：WebContentsView 会话所有权、每插件单实例、ready 握手与输入按序交付、旧 onActivate 仅再次激活、out/detach 通知；同实例转移到独立宿主窗口；停止/更新/失败幂等释放。窗口 hide 保留，明确退出销毁；不缓存多插件。

验证：真实 Electron 断言 view 身份、DOM 输入保留、事件顺序与次数、跨 feature 激活、启动中退出、崩溃恢复、权限与存储回归；不以 mocked BrowserWindow 代替最终验收。

## 4. 内置工具状态交接

文件：新增 `src/shared/tool-session.ts`、`src/renderer/tool-session.tsx`、宿主交接管理，`App.tsx`、`JsonTool.tsx`、`Scratchpad.tsx`、`Clipboard.tsx`、`Tools.tsx`、`FileSearch.tsx`。

行为：snapshot 两阶段交接，恢复失败/超时保留原工具；稿纸先 await flush；文件搜索在新 caller 重查；JSON 内容页签、剪贴板选择和各工具输入输出恢复。

验证：JSON 双栏分离、未保存编码输入/UUID 结果、稿纸 250ms 窗口与保存失败、剪贴板分类/选择、文件搜索重新授权；源视图成功后退出，失败仍可编辑。

## 5. 文档与最终验证

文件：`docs/plugin-sdk.md`、`README.md`、`docs/validation.md`、示例插件/测试夹具（仅必要变更）。

明确新 matches/context/资源/生命周期合同，外部插件默认内嵌、分离和退出行为及兼容范围。执行完整 typecheck/Vitest/build，与变更相关的跨平台 Playwright；Windows 专项仅有当地运行证据才标记通过。检查 `git diff --check` 和最终状态，记录 baseline 与平台限制，不进行 Git/远端收尾。

## 回滚

仅还原上述本次新增/修改内容，保留此前 dirty changes。无数据库清空、无破坏性迁移、无应用安装/生产修改。新的重大设计或外部发布另行授权；常规实现与验证失败修复继续执行。

## 进度

- [x] 已批准 spec 与计划保存；基线 typecheck/Vitest 通过。
- [x] 第一批：输入合同、匹配、资源和启动器。
- [x] 第二批：插件会话、内嵌/分离、内置状态交接。
- [x] 文档、相关集成验证和差异检查；平台限制与现有失败见下。


## 验证记录与边界

- 两批实现均落在当前 checkout，未创建 worktree、commit、push 或发布。本机工作期间另一会话提交了签名/更新功能，本实现保留其修改。
- 单元测试新增匹配合同/正则取消、资源授权、两阶段交接以及明确收录与后台捕获竞态用例。捕获竞态先出现 red（明确收录提前返回），修复后 green；完整结果 100 passed / 4 Windows skipped。
- 真实 Electron 已通过 17 组相关用例：其中本次 alignment 10 组；另有旧 SDK/插件安装更新权限、稿纸、JSON/编码、市场、文件搜索、图片收录和标题栏回归。文件搜索用隔离边界替身验证新 caller 重查及未授权路径拒绝，不声称 macOS 运行了 Everything。
- 初轮发现 macOS `Platform.writeFiles` 返回成功但回读为空。用户追加授权修复后，已修正 JXA 原生集合与 options 桥接；新增真实 AppKit 回归通过，既有文件收录 Electron 用例也已通过。新入口继续保留回读失败保护。详细证据见 `docs/validation.md` 的 macOS 文件剪贴板修复记录。
- 未运行 Windows 原生快捷方式/回贴/Everything；不以 macOS 的隔离替身测试替代这些平台验收。
