# Nexlet 验证记录

## macOS 本机固定签名验证（2026-10-12）

- 新增 `package:mac:local`，使用仓库外长期保留的专用代码签名身份。已获用户授权的信任仅限当前用户的 Code Signing，不包含 SSL/TLS 或系统级信任。
- 已构建 `0.2.2-local.1`、`0.2.2-local.2` 两个 arm64 DMG，`codesign --verify --deep --strict`、双方签名条件交叉校验与 `hdiutil verify` 均通过。证书 SHA-1 为 `69397314808BC8B95C8B4AF0FBDFA53C0184FC2C`，Bundle ID 为 `app.nexlet.desktop`。
- 两版 CDHash 分别为 `56e06245e9f135523ade636ae93c4ef76e1a2f7e`、`afc05f2a63ef454bc37a8059a3ec9caf7e1f562d`。代码发生变化但签名身份条件相同；此结果不能代替真实 TCC 授权保留验证。
- DMG SHA-256：第一版 `b5e0a329179c918fc65e80c7dc34d5049996b8c2046a72b067e3dcc7f6d4ccc0`，第二版 `19204358b52b3ac9e9353c7d8e5c9a02025d5e90d290719266a4af3b2e26cc86`。产物和 `local-signing.json` 位于对应 `release/local-signed-<版本>-arm64/`。
- 缺失身份与钥匙串不可用的负向检查均返回退出码 1，错误输出未泄露测试密码；脚本语法及 `git diff --check` 通过。构建结束后，用户钥匙串搜索列表已恢复为原有 `login.keychain-db`。
- 首次辅助功能提示修订已通过 70 项单元测试（另 4 项 Windows 专用测试跳过）、typecheck 和 build；原 ad-hoc 安装在用户重新添加辅助功能权限后，用户确认自动回贴成功。
- 本机 macOS 26.5.2 arm64 上已完成升级实测：第一版首次授权后，用户手动回贴成功；覆盖安装并启动 `0.2.2-local.2` 后，用户再次确认“成功，未重新授权”。升级期间没有重置、移除或切换辅助功能权限。17:22:19 的 TCC 日志确认第二版进程的签名条件匹配，并以 `Allowed (System Set), DB Action:None` 处理 Accessibility 请求。当前 `/Applications/Nexlet.app` 保留第二版。
- 初次失败时，17:05 的 TCC 日志确认 Accessibility、AppleEvents 和 PostEvent 请求获准，固定证书签名条件匹配；后续捕获到回贴目标为 uTools 或当前聊天应用，出现“无法恢复原应用焦点”。为排除快捷键及自动化操作的干扰，跨版本验收改为 `Ctrl+Option+Space` 下连续手动操作，以用户确认的目标文档结果为准。测试后按用户要求恢复 `Option+Space`，已回读设置为 `Alt+Space`；恢复后的同键干扰未重新验收。
- 已备份原 ad-hoc 应用及第一版固定签名应用。本次结论仅证明这台 Mac 上同一固定证书的两版升级保留了授权，不代表其他 macOS 环境或更换证书后的行为。此轮没有 commit、push、修改远端发布流程或 Apple 公证。

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


## 主程序更新验证（2026-10-12）

以下分别记录本地验证与提交后的 GitHub CI 结果。两个正式格式版本号仅用于隔离测试，不代表 GitHub 已发布这些版本。

- 已配置并回读仓库 Actions Secrets 名称：`NEXLET_MAC_CERTIFICATE_P12`、`NEXLET_MAC_CERTIFICATE_PASSWORD`。没有输出私钥或密码。
- macOS 26.5.2 arm64、Electron 44.7.0、electron-updater 6.8.10：固定证书构建 `0.2.3` / `0.2.4`，两份 DMG 与应用签名校验通过，ZIP、blockmap 和更新清单均生成。
- 原生更新链路使用 localhost feed、独立应用副本与 `.tmp/update-smoke/userdata`。为确保系统自动重启后仍使用隔离目录，仅在测试副本的入口注入固定测试目录和启动证据记录，再以同一证书重新签名；产品代码与更新器未替换为模拟实现。
- 错误签名 ZIP（主应用改为 ad-hoc 签名）经真实 Squirrel.Mac 拒绝，应用停留 `0.2.3` 并显示校验失败。随后重新检查正确签名 ZIP，下载、验证、安装与系统自动重启通过，启动记录读回 `0.2.4` 与新 PID；SQLite 中测试标记保留。原 `/Applications/Nexlet.app` 和用户数据未替换。
- 证据：本地 `.tmp/update-smoke/result.json`；两份构建的 `.tmp/update-e2e-a/local-signing.json`、`.tmp/update-e2e-b/local-signing.json`。这些临时测试产物不发布。
- `npm run typecheck`、`npm run build`、`git diff --check` 通过；当前工作区单元测试 98 项通过、4 项 Windows 专用测试跳过。构建保留原有大于 500 kB 的 chunk 提示。
- 设置页更新入口已通过真实界面检查；测试模式的检查按钮正确禁用。
- `actionlint 1.7.12` 检查更新后的 workflow 通过。版本、资产大小与 SHA-512 不符会使更新清单合并失败；回归测试覆盖双架构合并、状态转换、签名/网络失败、安装前保存确认与超时。
- Windows 安装版与便携版配置已接入；CI 已生成 NSIS 安装包并验证解压应用与便携版实际启动。尚未实测 Windows NSIS 安装流程和跨版本自动更新。
- 提交 `de217ca0eb9973bf9f285497c81dc7fbff1568b0` 的 [GitHub Actions 完整运行](https://github.com/Cansiny0320/Nexlet/actions/runs/38235133659) 已通过：Windows x64、macOS Intel、macOS Apple Silicon 均完成类型检查、单元测试、构建、打包与启动检查；Windows 为 90 项单元测试和 16 项桌面集成测试通过。
- 两个 macOS CI 构建的签名证书均读回 `69397314808BC8B95C8B4AF0FBDFA53C0184FC2C`，与本地固定证书一致。打包后撤销临时 Code Signing 信任、验证身份不再受信任并删除临时钥匙串；清理失败会使 CI 失败。
- 汇总 job 已验证双架构更新清单、产物大小与 SHA-512，并生成 SHA256SUMS。只推送源码到 `main`，没有创建版本标签或 GitHub Release；首个含更新器的正式版本仍需手动安装。

- 提交前额外导出仅含本次签名/更新改动的源码快照，排除其他会话的内容启动和工具分离修改：typecheck、build 通过，86 项单元测试通过，4 项 Windows 专用测试跳过。
