# 选区与超级面板实施计划

设计：../specs/2026-10-13-selection-super-panel.md。执行前已备份当前 src/tests/scripts 与 Git diff 到 .tmp/utools-selection-baseline；当前已有入口、系统图标、插件更新改动，按局部补丁合并。

1. **配置与手势状态机**：新增 shared/super-panel.ts、main/panel-config.ts、main/panel-gesture.ts 及 tests。验证 revision 冲突、独立固定项、分组/排序不丢 ID、短按/长按/拖动/释放/停用。先运行对应 Vitest 红测试再实现。
2. **选区事务**：新增 main/selection.ts、selection-platform.ts，扩展 Platform 的前台身份/激活以及 ClipboardService 暂停 API，扩展 LaunchInputs 的宿主选区入口与转移。验证无选区不取旧内容、超时与取消、并发复制不覆盖、历史暂停恢复、文件授权和大小限制。
3. **原生触发**：新增 main/panel-native-worker.ts 与 main/panel-trigger.ts，使用现有 koffi，构建增加 worker 入口。macOS CGEventTap、Windows WH_MOUSE_LL 分离消息循环，权限/失败状态可读、停用释放资源。验证纯手势状态机与 native 参数；本机有权限时做原生 smoke。
4. **面板与主进程接入**：新增 renderer/SuperPanel.tsx、PanelSettings.tsx 与 main/super-panel.ts；改 main/index.ts、App.tsx、Settings.tsx、CommandManager.tsx、styles.css、shared/types.ts。复用已有注册器、执行入口及输入匹配；支持匹配预览、收藏/文件夹/分页、转主搜索、快捷键带选区、权限入口。添加时间戳本地匹配及 SDK 文档。
5. **验证与对比**：新增 tests/super-panel.spec.ts 使用隔离数据和可控原生后端，验证真实 Electron UI 与生命周期。运行 Node 24 下 npm run typecheck、npm test、npm run build、目标 Playwright 和 git diff --check；build 写 ignored dist，E2E 写隔离用户数据/test-results，不调用真实电源操作或外部服务。独立完成本机可执行的原生 smoke，Windows 未实机验证明确注明。对比表分已实现、实测、剩余差异。

## 进度

- [x] 配置与手势
- [x] 选区事务
- [x] 原生触发
- [x] 面板与集成
- [x] 验证与逐项对比

回滚只撤销本批补丁及新增文件，新 panel-config 可忽略；不重置整个工作区。原生监听可通过设置立即停用。无远端或发布步骤。

## 交付与验证结果

- 已完成配置、原生触发、选区事务、面板 UI、逐功能带选区快捷键、SDK 来源扩展及输入授权接入。
- macOS 复制兜底的 HTML 字节回读发现 Electron 恢复转换问题，新增 `src/main/selection-pasteboard-mac.ts` 按原生格式和字节恢复；独立命名 pasteboard 的红测试转绿，真实选区复制后的全格式回读一致。
- `npm run typecheck`、`npm run build`、`git diff --check -- src tests docs scripts/build.mjs` 通过；Node 24.19.0 下 `npm test` 为 50 个文件、397 项通过。
- 目标 Playwright 涵盖 34 项，分批通过：首轮 33/34；列表切换的键盘测试隔离桌面指针输入后，entry-alignment 全部 9 项通过。面板新增 7 项通过。
- macOS 原生手势与选区已验证；Windows 未实机验收，Linux 自动选区 / 鼠标触发不在本批支持范围。没有执行 commit、push、打包安装或发布。
- 完整对照、实际验证边界、使用入口、截图与证据摘要：[交付报告](../../validation/selection-super-panel-2026-10-13.md)。
