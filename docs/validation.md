# Nexlet 验证记录

## 0.2.2 本地修订（2026-10-12）

- 文件搜索空输入现在返回待输入状态，不启动 Everything 或执行探测查询；清空搜索框后，旧查询返回的结果或错误不会覆盖待输入页面。
- 现场确认 ES `-timeout 1500` 在首次索引尚未就绪时返回 Error 8，但同一实例的版本查询仍正常。根据 [ES 源码](https://github.com/voidtools/ES/blob/master/src/es.c) 中等待数据库加载的逻辑，改为读回同一实例状态：仍响应时显示索引中并自动重试，实例不可用时提示连接中断，导出错误仍报告失败。
- 飞书的桌面和开始菜单快捷方式都指向 `icon.ico`。现场确认 `app.getFileIcon` 返回通用文件图标，`nativeImage.createFromPath` 能读出实际 ICO 像素；修复后两条搜索结果均与该图像一致。
- `npm run typecheck`、71 项单元测试、13 项桌面集成测试通过。覆盖空输入不启动、索引等待与恢复、引擎断开、过期错误、ICO 实际显示及原有功能。
- 用户原有索引随后完成，只读查询实际找到了 `release/Nexlet-0.2.1-Windows-x64.exe`。测试没有停止、重启或调整用户的 Everything 实例。
- 界面核对：`test-results/feishu-icons-fixed.png`、`test-results/filesearch-idle-fixed.png`。最终源码、三平台附件及发布状态以 [v0.2.2 发行页](https://github.com/Cansiny0320/Nexlet/releases/tag/v0.2.2) 为准。
- `npm run smoke:package` 与 `npm run smoke:portable` 均通过，版本读回为 0.2.2；打包程序验证空输入待输入及内置 Everything 的真实文件查询。产物为 `release/Nexlet-0.2.2-Windows-x64.exe`（103,303,864 字节）。

## 0.2.1 本地修订（2026-10-12）

- 当前运行的用户进程确认来自 `Nexlet-0.1.0-Windows-x64.exe`，因此仍显示旧版 JSON 页面。0.2.1 包含已有的树形美化和红绿差异对比。
- 标题栏增加独立拖动手柄，工具名称改为可拖动区域，返回按钮单独排除；计算样式和 Electron 实际命中区域均已核对。
- 对最小化恢复、托盘使用的统一唤起入口、重复启动与应用激活添加恢复、前置和聚焦处理。集成测试验证窗口可见、非最小化、已聚焦，并保持原有非置顶状态。
- 设置新增开机自启动；系统状态读回、便携 EXE 稳定路径、后台启动、系统禁用与 macOS 待批准分支有回归测试。注册写入边界以替身验证，没有修改用户系统自启动项，也没有做真实重启验收。
- `npm run typecheck`、66 项单元测试、12 项桌面集成测试通过。解压目录和单文件便携 EXE 的 0.2.1 启动检查通过，内置 Everything 实际查询通过。
- 原生鼠标拖动自动化无法移动 Nexlet，系统原生标题栏对照窗口也无法被同一操作移动，因此不将该结果归因于 Nexlet，也不声称完成实际鼠标移动验收。
- 产物：`release/Nexlet-0.2.1-Windows-x64.exe`。此修订已纳入 0.2.2；下面的三平台 CI 记录属于前一版本。

## 0.2.0 验证

验证日期：2026-10-12。开发环境：Windows 10.0.26300 x64、Node.js 25.2.1、Electron 44.7.0。测试使用隔离的 `.tmp` 用户目录，截图只含测试数据。

## 本机验证

| 检查 | 结果与证据范围 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm test` | 8 个测试文件、61 项通过 |
| `npm run test:e2e` | 9 组桌面集成用例通过 |
| `node scripts/smoke-marketplace.mjs` | 从真实 GitHub 目录下载便笺，安装来源为 marketplace，PNG 图标正常，插件打开并保存文本成功 |
| `node scripts/smoke-package.mjs` | 0.2.0 解压版实际启动，后台剪贴板、计算、原生桥接和随包 Everything 查询真实文件通过 |
| `npm audit --omit=dev` | 运行依赖 0 项漏洞报告 |
| `actionlint` | 主程序和插件仓库工作流均通过静态检查 |

核心用例覆盖应用与 `.lnk` 快捷方式检索和真实启动、逐行续算、稿纸备注与锁定、重启恢复、文本 / 图片 / 文件剪贴板、合并复制、收藏与中转窗口、文件拖入和图片粘贴、错误输入和主题切换。

本轮新增验收：

- JSON 双栏格式化、树形折叠、错误定位、大整数原文保留、对象键顺序选项与红绿差异。
- 插件市场目录缓存、离线回退、包 ID / 版本一致性、取消更新、失败保留旧版本、更新保留数据、PNG 图标边界。
- 使用真实内置 Everything 1.4.1.1032，在普通权限下启动专用实例，索引包含中文、空格与逗号的临时目录；搜索、复制路径、文件操作边界、空结果和退出时进程回收。
- 将 `-exit` 作为搜索内容不会控制或退出引擎；随后仍能正常查询。ES 无匹配时实际导出空文件，已按空结果处理。
- Windows 应用图标解析 `.lnk` 的 icon / target；真实 Chrome、微信、VS Code 与记事本图标已读取和比对，避免把通用快捷方式图标当成应用图标。
- Windows 便携启动中的短路径与长路径按真实文件身份比较，不再误拦截宿主 IPC。

原生外部回贴在 0.1.0 阶段已完成专项验证：真实 `.lnk` 启动独立测试编辑器，核对前台 PID，发送系统粘贴后读取目标编辑器，确认收到完整文本。本轮保留该实现与专项入口。运行方式：

```powershell
$env:NEXLET_NATIVE_PASTE='1'
npx playwright test -g '启动器、快捷方式检索与真实启动'
Remove-Item Env:NEXLET_NATIVE_PASTE
```

## GitHub CI

主仓库：[Cansiny0320/Nexlet](https://github.com/Cansiny0320/Nexlet)。基础版本提交 `6277f6782f194cd8c1b23eeaa7ae4e722f4136e0` 的 [完整三平台运行](https://github.com/Cansiny0320/Nexlet/actions/runs/38157028460) 已通过：Windows x64、macOS Intel、macOS Apple Silicon 均构建并实际启动了打包程序。Windows 还通过单文件便携 EXE 检查。新提交的当前状态以 [Actions](https://github.com/Cansiny0320/Nexlet/actions/workflows/release.yml) 为准。

主程序 CI 对类型检查、单元测试、Windows 桌面集成测试、三平台打包和启动检查设为串联门槛。新增 Windows 包检查会调用随包 Everything 查询隔离夹具。成功构建上传三个平台安装包及校验清单；`v*` 标签进一步生成可审阅的 Release 草稿。

插件仓库：[Cansiny0320/Nexlet-plugins](https://github.com/Cansiny0320/Nexlet-plugins)。`main` 和 `v1.0.0` workflow 均通过，公开 [v1.0.0 Release](https://github.com/Cansiny0320/Nexlet-plugins/releases/tag/v1.0.0) 包含真实的 `hello-nexlet.nexlet`，已从 Nexlet 内安装验收。

## 产物与复验

Windows 本地产物为 `release/Nexlet-0.2.0-Windows-x64.exe`，解压入口为 `release/win-unpacked/Nexlet.exe`。

```powershell
npm run package:win
node scripts/smoke-package.mjs
node scripts/smoke-portable.mjs
```

便携包装器连接真实渲染进程，读取启动界面并计算 `128*3 = 384`。解压包检查另验证后台剪贴板捕获和内置引擎查询。测试运行截图位于 `test-results`；供文档展示的真实界面位于 `docs/screenshots`。

## 仍需明确的边界

- Windows Nexlet 包未签名。随包 Everything 是官方未修改的稳定版，保留原签名及许可，但这不构成对 Nexlet EXE 的签名。
- macOS CI 已证明构建与打包后启动，尚未覆盖真实用户桌面的回贴、辅助功能授权、跨应用焦点，以及 Developer ID 签名和公证。
- 本机 GUI 主要在单屏 100% 缩放下测试；其他 DPI、跨屏和提权目标窗口未完整验收。
- Everything 使用无需服务的文件夹索引，默认只索引当前用户能够访问的文件。首次全盘扫描速度未在本次测试中测量；测试仅扫描临时夹具，不能将其耗时当成全盘性能。
- 运行依赖审计为 0；完整审计还有 8 项 moderate，来自 electron-builder 开发依赖链。未执行不相容的强制替换。
- Linux 没有发行包；文件剪贴板、自动回贴和 Everything 集成未支持。

当前机器的 `Alt+Space` 被其他应用占用，Nexlet 正确提示冲突，未改动其他应用。测试和市场验收使用独立用户目录；现有 Nexlet 数据与正在运行的旧版本保留。
