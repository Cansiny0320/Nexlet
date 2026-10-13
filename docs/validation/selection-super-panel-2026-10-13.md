# 选区与超级面板：实现、验证与 uTools 对照

2026-10-13，本批已实现用户批准的选区与超级面板范围。改动保留在本地工作区；本会话未 commit、push、安装或发布。仓库同时存在 Linux、更新系统等其他工作，本报告只覆盖本批及关联回归。

## 使用入口

在「设置 → 选区与超级面板」配置长按右键、中键、面板快捷键和排除应用。默认启用右键长按 200 ms，可调到 400 ms；macOS 需要辅助功能权限，授权后点击「重新检查权限与监听」。可关闭鼠标触发并保留面板快捷键。

先在其他应用选择文本、图片、文件或目录，再触发面板。匹配页显示本次输入；常用入口页支持添加、拖拽排序、拖到图标中央建立文件夹，以及管理、命名、移出、移除和滚轮分页。「转到主搜索」保留结构化输入。功能管理中的「带入当前选区」默认关闭，可以逐功能开启。

## 逐项对照

uTools 基线为本机 7.8.0 ASAR 静态分析和[官方超级面板说明](https://www.u-tools.cn/docs/guide/uTools-super-panel.html)。静态证据不是 uTools 运行实测，也不代表最新版的所有行为。

| 能力 | uTools 基线 | Nexlet 本批结果 | 验证与边界 |
| --- | --- | --- | --- |
| 当前选区 | 根据前台应用取得文本、图片、文件等输入 | macOS 原生文本读取优先；复制兜底支持文本、PNG、多个文件及目录；无新选区不使用旧剪贴板 | macOS 原生独立应用验证通过；未宣称适用于所有应用的自定义画布 |
| 长按右键 / 中键 | 右键长按约 200 ms，可调 200–400 ms；中键入口 | 已实现相同触发方式与调整范围，短按重放原右键，触发前拖动取消 | macOS 真实事件验证短按、连续 4 次长按、中键及应用排除；Windows 待实机验收 |
| 滑动释放 | 长按后悬停释放执行，快速释放可留在点击模式 | 已实现悬停执行、快速释放保留、空白释放保留、面板外释放 / 点击关闭、Escape 关闭 | 原生事件执行 JSON、面板外释放及 Electron UI 测试通过 |
| 面板位置与焦点 | 鼠标附近显示，选区在展示前获取 | 独立窗口，限制在当前显示器 workArea 内；鼠标触发先显示但不抢焦点；主窗口草稿保留 | 原生悬停执行通过；边界计算 / 极端坐标覆盖，未做真实多显示器硬件验收 |
| 内容匹配与转主搜索 | 根据输入提供候选功能并继续处理 | 复用文本、图片、文件、JSON、计算、时间戳等匹配，提供网页搜索模板，并可转主搜索 | JSON、毫秒时间戳、图片、文件及模板单次编码通过；插件候选取决于其 matches 声明 |
| 常用入口与文件夹 | 独立管理、排序、分组和翻页 | 首次复制主页固定项，之后独立保存；单层文件夹、拖拽排序、改名、移出、移除、分页 | 配置 revision、UI 拖拽、文件夹和翻页通过；禁用 / 卸载保留配置但拦截执行 |
| 功能快捷键带选区 | 功能快捷键可取得选区 | 增加逐功能 captureSelection 开关；关闭时继续聚焦原工具 / 插件实例并保留草稿 | 带入新选区与关闭开关后的草稿保留通过；快捷键冲突沿用统一注册及回滚机制 |
| 输入生命周期 | 当前输入进入目标功能 | SDK v1 新增 from: selection；只给用户选择的插件授予资源 token，面板关闭不撤销已交付 token | 插件实际读取文件内容通过；目录只允许元信息，重新进入 / 退出仍按现有规则撤销 token |

额外重复原生手势测试中，真实桌面鼠标移动会触发正常的拖动取消，不能把这类共享桌面运行当成稳定的无人值守测试；这里记录的是已完整通过断言的一轮原生手势验证。选区与原生格式恢复在最终修复后单独复验通过。

本批按批准范围未实现 uTools 的语音、自动翻译、窗口管理、截图 / OCR。继续保留 Nexlet 自有 manifest、SDK 与沙箱，不提供 `.upx` 或 `window.utools` 兼容。

## 剪贴板事务

复制前物化当前格式并暂停 Nexlet 历史捕获；macOS 使用 NSPasteboardItem 原始类型与字节备份 / 恢复，避免 Electron HTML 写入的格式转换，校验前台身份和按键释放。观察到版本变化后等待 50 ms，重新检查版本再读取，避免过早读到尚未填充完整的多项文件。只有剪贴板仍为本次读取版本时才尝试恢复；外部复制导致版本变化时不覆盖新内容。超时、无选区、取消、读取失败均有回归覆盖。

原生 smoke 使用独立 Electron 应用提供可控文本、图片和文件复制，真实发送 macOS 复制键和鼠标事件，并验证选区与文本 / HTML 基线恢复。修复 HTML 字节变化后重新运行真实选区读取，比较恢复前后的全部原生格式与数据，结果一致；独立命名 pasteboard 另外覆盖多个条目、自定义二进制格式和空内容。测试过程中保存原剪贴板，仅在它仍属于测试事务时恢复。证据摘要见 [macOS 原生验证结果](selection-native-macos-2026-10-13.json)，示例均为合成测试数据。

剪贴板版本检查不是跨进程原子锁。其他剪贴板管理器、延迟写入和应用私有格式仍可能影响读取 / 恢复，不能承诺所有应用中绝对无竞态。快照超过 64 MB 或无法完整读取时不执行复制兜底。图片和文件继续使用既有输入大小及授权限制。

## 验证记录

运行环境：macOS，Node 24.19.0，Electron 44.7.0。单元测试、构建与检查均使用项目已有命令；原生 smoke 使用已获辅助功能权限的开发态 Electron，并非已安装 Nexlet 包。

- `npm run typecheck`：通过。
- `npm test`：50 个测试文件、397 项通过。
- `npm run build`：通过，原生监听 worker 已加入构建入口。
- 目标 Playwright：super-panel、entry-alignment、alignment、system-search、catalog-icons，共 34 项分批通过。首轮 33/34，列表切换用例受到桌面指针选择事件影响；为其键盘切换场景隔离候选区指针事件后，entry-alignment 的 9 项完整复跑通过。
- `git diff --check -- src tests docs scripts/build.mjs`：通过。
- macOS 原生 smoke：文本原生读取不改变剪贴板；复制文本 / 图片 / 文件及目录；无选区；右键短按、长按、中键、悬停执行、面板外释放和排除应用均通过。

新测试位于 `tests/selection.test.ts`、`selection-pasteboard-mac.test.ts`、`panel-gesture.test.ts`、`panel-config.test.ts`、`super-panel.spec.ts`，并补充剪贴板历史暂停与资源转移回归。原生 smoke 的本地脚本与完整运行数据位于 `.tmp/selection-native-validation/`；它不是常规自动运行的单元测试，运行时会短暂控制鼠标和剪贴板。

Windows 仍使用 Electron 剪贴板备份 / 恢复，未验证所有原生格式的字节一致性。Windows 的 `WH_MOUSE_LL`、前台身份和 `SendInput` 复制分支已经实现，但未在 Windows 实机运行。终端应用使用 Ctrl+Insert；其他应用使用 Ctrl+C，不自动提权。Linux 在这批中只提供空面板快捷键 / 手动入口，鼠标监听和自动选区没有实现。

上一批已确认的 macOS 原生窗口 `isFocused()` 断言失败，以及 `electron.spec.ts` 的 Windows `.lnk` 假设，仍属于已有测试边界；本批不将目标测试通过写成全平台完整 E2E 通过。

## 界面

![真实选区进入超级面板](selection-super-panel-2026-10-13.png)

实现依据还包括 [Apple NSPasteboardItem](https://developer.apple.com/documentation/appkit/nspasteboarditem)、本机 Xcode SDK 的 NSPasteboard / NSPasteboardItem 声明，以及 [Electron ClipboardItem 文档](https://www.electronjs.org/docs/latest/api/clipboard-item)。

## 文件与回滚

核心文件：`src/main/selection*.ts`、`panel-config.ts`、`panel-gesture.ts`、`panel-native-worker.ts`、`panel-trigger.ts`、`super-panel.ts`；界面为 `src/renderer/SuperPanel.tsx`、`PanelSettings.tsx`；配置类型位于 `src/shared/super-panel.ts`。主进程集成复用原命令执行入口和 LaunchInputs。

可先在设置关闭鼠标触发或整个面板。代码回滚仅撤销本批补丁及新增文件；`panel-config` 可忽略，不重置其他工作区改动。设计与实施记录见 `docs/superpowers/specs/2026-10-13-selection-super-panel.md` 和对应 plans 文件。
