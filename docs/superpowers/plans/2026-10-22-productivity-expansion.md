# 十二项效率功能实施计划

对应 spec：`../specs/2026-10-22-productivity-expansion.md`。设计和实现均已批准；在当前两个仓库中连续完成，不额外创建 worktree 或提交。

## 验证环境与副作用

- 使用本机已验证 `/Users/bytedance/.nvm/versions/node/v24.19.0/bin/node`，将其目录放在本次命令 PATH 前。
- 主仓 pnpm 12.14.0 启动失败；使用已安装 `node node_modules/vite-plus/bin/vp` 等价运行 `check`、`test run`，不改依赖或锁文件。
- `vp check`、`vp test run`、插件 `npm run typecheck`、`npm test` 无自动修复；测试使用临时目录。
- `node scripts/build.mjs` 写入主仓 `dist/`；插件构建写 `.build/`，打包写 `dist/`；格式化仅对本次改动文件执行。
- Electron 测试使用临时 userData、测试剪贴板、模拟网络和临时文件。真实 OCR 不联网；AI 用本地 OpenAI-compatible fixture，不调用私人账户。

## 任务与依赖

### A. 基线和共享合同
- 检查两个仓库状态，运行主仓 check/unit、插件 typecheck/unit，记录既有失败。
- 扩展 `src/shared/types.ts`、`host-rpc.ts`、`launch.ts`、`plugin-api.ts`，按模块新增配置/短语/工作区/动作/会话类型。
- 先添加行为测试，覆盖校验与隔离；增量实现，保持旧接口可用。

### B. 状态、继续处理、动作菜单（7、2、9）
- 文件：`src/renderer/App.tsx`、`tool-session.tsx`、`ToolBoundary.tsx`、`common.tsx`；新增会话缓存及动作菜单模块。
- 主进程：`src/main/index.ts`、`plugins.ts`、`plugin-runtime.ts`、`launch-input.ts`；新增结果交接与会话存储模块。
- SDK：`src/preload/plugin.ts`、`plugin-sdk.ts`、`src/shared/plugin-api.ts`，运行 `scripts/sync-plugin-sdk.mjs` 同步插件声明。
- 官方插件：OCR、翻译、文字转图增加快照和输出交接；内置 JSON/编码/时间戳/稿纸发布结果。
- 测试：状态往返、显式新输入、分离、重启恢复可选、资源过期、禁用插件、动作键盘/焦点/IME。
- 验证：新增单测、`tests/productivity.spec.ts`，已有 backspace、detach、plugin-close、host-rpc 相关 suites。

### C. 快捷短语与工作区（1、4）
- 新增 `src/shared/productivity.ts`、`src/main/productivity.ts`、`src/renderer/Productivity.tsx`（可按职责拆分）。
- 接入 `CommandRegistry` 及 `sourceCommands()/execute()`，复用别名、固定、快捷键。
- 短语支持分组、变量、预览、复制/回贴；工作区有序结构化操作、失败重试、单项执行。
- 测试：模板缺参/转义/Unicode、更新冲突、执行次序、非法程序参数、失败后只重试失败项。

### D. AI 插件及配置导入导出（6、3）
- 新增插件 `../Nexlet-plugins/plugins/ai-actions/`，复用 AI provider、secrets、任务取消和结果接口。
- 新增 `src/main/config-profile.ts`、`src/shared/config-profile.ts`、`src/renderer/ConfigProfile.tsx`，接入 Settings。
- 导出显式允许类别；AI 动作定义采用明确合同；不遍历任意插件数据库。导入先验证/预览再事务应用，保留撤销快照，副作用（快捷键、索引）按差异刷新。
- 测试：本地流式 fixture、取消/失败、配置缺失、导出敏感字段排除、往返、冲突预览、非法 JSONC、跨平台路径、撤销。

### E. 剪贴板 HTML 与记录控制（8、11）
- 文件：`src/main/clipboard.ts`、`store.ts`、`platform.ts`、`src/shared/clipboard.ts`、`types.ts`、`src/renderer/Clipboard.tsx`、`Settings.tsx`。
- 复用原有格式标记过滤；HTML 单独存储/按需读取，保留复制样式及纯文本动作；暂停截止时间与应用排除不改变原记录。
- 添加清理预览/确认，收藏默认保护；HTML 继续处理传递给文字转图。
- 测试：去重、纯文本/样式、多选、摘要、暂停边界、前台未知、收藏/时间范围。

### F. OCR 索引、文件预览与搜索（5、12、10）
- 新增 OCR 任务调度/索引模块，复用插件 OCR engine 与模型，通过独立隔离任务运行；仅处理用户选择或明确开启的收藏图片。
- 新增文件预览模块与 `FileSearch.tsx` 预览区；快速切换序号隔离、大小/二进制限制。
- 扩展 `src/shared/search.ts` 和渲染高亮，新增本地关键词偏好，限制只记录普通命令搜索且不记录带入正文；Settings 提供清除。
- 测试：图片删除竞态、索引取消、真实 OCR fixture、异步预览过期、模糊匹配精度及 exact priority。

### G. 综合验收与文档
- 三语言文案、README/SDK 使用说明、变更说明同步；不改发布版本或远端市场。
- 主仓 `vp check`、`vp test run`、`node scripts/build.mjs` 和相关 Electron tests；插件 `npm run typecheck`、`npm test`、受影响插件 build/package 及集成 tests。
- 使用临时数据截图检查浅深色、窄窗口、键盘流程、表单错误持续可见。
- 记录已验证平台、测试数、未验证项和基线失败至 `docs/validation/productivity-expansion-2026-10-22.md`。

## 风险与回滚

- 配置导入及富文本数据变化用事务和可选字段保证旧数据可读；导入提供撤销。新增配置/会话/索引独立 key/table，旧版本可忽略。
- 插件 SDK 增量扩展；官方插件同步 minHostVersion。保留旧 `returnToLauncher`、storage 和输入接口。
- OCR 和预览需要限制资源、取消并清理；不能因后台任务阻塞唤起或退出。
- 回滚本次代码及文档即可；不删除用户数据库，不覆盖并行修改。没有 commit/push/发布授权。

## 状态

- [x] A 基线和共享合同
- [x] B 状态、继续处理、动作菜单
- [x] C 快捷短语与工作区
- [x] D AI 与配置文件
- [x] E 剪贴板
- [x] F OCR、预览、搜索
- [x] G 综合验收（结果与既有失败见 validation 记录）
