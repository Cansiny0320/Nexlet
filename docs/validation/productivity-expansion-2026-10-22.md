# 十二项效率功能验收记录

日期：2026-10-22。当前两个仓库的本地实现，未 commit、push、发布或替换日常安装。主仓初始 `74c7d63`，插件仓初始 `8714e13`。保留并行性能任务的修改；主仓全量检查覆盖合并后的工作区。

## 实现与证据

| 功能 | 本次行为 | 主要验证 |
| --- | --- | --- |
| 快捷短语 | 分组、变量、预览、复制/回贴、独立指令 | `productivity.test.ts`、`productivity.spec.ts` |
| 继续处理 | 文本/HTML/图片/文件交接，源状态保留 | `launch-input.test.ts`、`productivity.spec.ts`、AI/OCR/文字转图集成 |
| 配置文件 | JSONC 允许字段、类别差异、事务导入、过期保护、撤销 | `config-profile.test.ts`、`productivity.spec.ts` |
| 工作区 | 结构化启动、顺序执行、单项失败、取消、仅重试失败项 | `productivity.test.ts`、`productivity.spec.ts` |
| 图片文字搜索 | 独立离线 OCR 队列、取消/清除、删除竞态保护 | `clipboard-ocr.test.ts`、真实 `clipboard-ocr.spec.ts` |
| AI 动作 | 四个预设、自定义 Prompt/模型/地址、流式输出、密钥隔离 | 插件 `ai-actions.test.mjs`、真实宿主 + 本地 HTTP SSE fixture |
| 工具状态 | 本次运行缓存、可选跨重启、清除、独立窗口隔离 | `tool-drafts.test.ts`、`productivity.spec.ts`、插件集成 |
| 富文本历史 | HTML 独立保存、纯文本/保留格式动作、摘要不带 HTML | `clipboard-controls.test.ts`、`productivity.spec.ts`、文字转图集成 |
| 动作菜单 | Cmd/Ctrl+K、右键、键盘导航、焦点恢复、输入法保护 | `productivity.spec.ts`、原有导航回归 |
| 搜索 | 分层匹配、轻量错拼、高亮、受限本地学习及清除 | `search-preferences.test.ts`、既有搜索单测 |
| 记录控制 | 定时暂停、应用排除、时段预览清理、收藏保护 | `clipboard-controls.test.ts`、原有剪贴板回归 |
| 文件预览 | 有界文本读取、图片解码限制、过期结果隔离 | `file-preview.test.ts`、`productivity.spec.ts`、Spotlight 集成 |

## 全量检查

- 主仓 `node node_modules/vite-plus/bin/vp check`：368 个文件格式通过；338 个文件无 lint、类型错误或警告。
- 主仓 `node node_modules/vite-plus/bin/vp test run`：91 个测试文件通过，1 个跳过；588 项通过、2 项跳过。跳过项为 Windows 资源图标测试。
- 主仓 `node scripts/build.mjs`：通过。Vite 保留既有大 chunk 提示。
- 收尾发现并修复配置导入绕过面板总量和本地入口名称限制的问题：新增测试先失败，修复后配置单测 5 项通过；配置差异导入/撤销的 Electron 用例再次通过。
- 插件 `npm run typecheck`：通过。
- 插件 `npm test`：54 项中 53 项通过、1 项既有失败。`tests/packaging.test.mjs:17` 的手工插件目录映射没有覆盖已存在的条目，`path.join` 收到 `undefined`。此问题在功能修改前已复现，未改动无关发布测试。
- 四个插件 `ai-actions`、`translate`、`text-image`、`ocr`：构建及本地 `.nexlet` 打包通过；OCR 的模型 chunk 大小提示保留。
- AI 本地集成：模型/密钥隔离、UTF-8 流式输出、继续处理、恢复、取消、HTTP 503 和未保存配置恢复均通过。
- 并行性能任务提供的主仓回归：25 项通过，含剪贴板 Worker、插件更新/重启、退出和更新面板。已回读日志核对。

- 产品相关 Electron 本轮共 30 项：最终累计 27 项通过、1 项既有失败、1 项按环境跳过、1 项受串行前置失败影响未运行。新增 `productivity.spec.ts` 的 10 项全部通过；其中独立窗口测试首次因 fixture 使用 `BrowserWindow.getAllWindows()[0]` 错选新窗口而失败，改为明确选择主窗口后单独复测通过，应用代码无需修改。
- 既有失败位于 `tests/filesearch-mac.spec.ts:90`：双击 `Calculator.app` 后等待“打开所在文件夹”超时。当前 `HEAD` 原有 `activate()` 已按 `directory` 浏览目录，因而进入 `.app/Contents`；本次未更改该行为。其后一项串行用例未运行，未计作通过。真实 Spotlight 范围/查询用例通过，新增文本/图片预览、键盘切换、过期响应与继续处理用例通过。
- 翻译插件 7 项本地 fixture/真实宿主用例通过；Google 真实外网接口用例按原有环境开关跳过，未声称在线服务验收。
- 配套 OCR 包真实安装后对 3 张截图识别通过（输出分别 129、182、403 字符），并通过取消、继续处理及图片/结果恢复，恢复未重新识别。
- 文字转图包真实安装、HTML/PNG、格式样式与恶意 HTML 清理、历史 HTML 交接、草稿恢复和 PNG 继续处理通过；AI 插件集成及浅深色/窄窗口断言通过。
- 三语字面文案扫描：English、繁体中文缺失 key 均为 0；已有动态类别和状态名称另行补齐。截图人工检查覆盖简体浅色、繁体深色、English 窄窗口、AI 窄窗口与文字转图深色。

## 界面证据

[简体浅色](productivity-2026-10-22/snippets-zh-CN-light.png) · [繁体深色](productivity-2026-10-22/snippets-zh-Hant-dark.png) · [English 窄窗口](productivity-2026-10-22/snippets-en-narrow.png) · [AI 动作](productivity-2026-10-22/ai-actions-narrow.png) · [文字表格转图](productivity-2026-10-22/text-image-dark.png)

主仓运行命令：

```sh
node node_modules/@playwright/test/cli.js test tests/productivity.spec.ts tests/clipboard-ocr.spec.ts tests/backspace-navigation.spec.ts tests/plugin-close-persistence.spec.ts tests/host-rpc.spec.ts tests/i18n.spec.ts tests/filesearch-mac.spec.ts tests/launch-preview.spec.ts tests/translation.spec.ts --output=/tmp/nexlet-productivity-e2e-results
node node_modules/@playwright/test/cli.js test tests/productivity.spec.ts --grep '独立窗口隔离' --output=/tmp/nexlet-productivity-isolation-results
```

插件仓运行 `node tests/ai-actions.e2e.mjs`、`node tests/text-image.e2e.mjs` 和 `node tests/ocr.e2e.mjs`，均退出 0。本地安装包位于插件仓 `dist/ai-actions.nexlet`、`dist/translate.nexlet`、`dist/text-image.nexlet`、`dist/ocr.nexlet`。

## 实测边界

实机为 macOS，Node 24.19.0，Electron 44。AI 使用本地 OpenAI-compatible fixture，不调用付费模型或私人账号。工作区流程用受控启动器验证顺序、错误和重试，不批量打开用户的真实应用；Windows/Linux 启动参数有单测，未做这两个系统的实机验收。按应用排除的判断逻辑有覆盖，未对每一个第三方应用逐一实测。

本次发布目标为 `v0.2.41`，配套插件最低宿主版本为 `0.2.41`，并保留能力检测。图片索引要求离线 OCR `1.1.0` 或更新版本。配置导出排除凭据与历史，但用户填写的路径、Prompt 等配置本身仍可能含私人内容。

使用说明见 [效率功能](../productivity.md)，SDK 见 [扩展合同](../plugin-sdk-extensions.md)。

## 发布准备补验

- 插件历史 URL 打包测试改为明确选取原有预编译 JS fixtures，修复新增插件使目录映射缺失的问题；完整插件单测 **54 / 54** 通过，Ctool 检查 **10 / 10** 通过。
- 主仓 `check`、构建和文件预览回归通过；文件 fixture 使用跨平台路径与索引状态。离线 OCR 集成测试要求已构建的邻接插件仓，缺少该外部 fixture 的 CI 显式跳过，本机真实 OCR 已验证。
- 自启动集成测试改为模拟设置页重新聚焦，符合按需刷新状态的现有行为；本机回归通过。
- 插件发布流水线测试宿主更新为 `v0.2.41`，使用宿主当前的 pnpm 锁文件。六个新插件版本完成发布预检与本地打包。
