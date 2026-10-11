<p align="center"><img src="assets/icon.png" width="76" alt="Nexlet"></p>
<h1 align="center">Nexlet</h1>
<p align="center">按下快捷键，把常用工具带到手边。</p>
<p align="center">
  <a href="https://github.com/Cansiny0320/Nexlet/actions/workflows/release.yml"><img src="https://github.com/Cansiny0320/Nexlet/actions/workflows/release.yml/badge.svg" alt="Build and Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-6875e9" alt="Windows and macOS">
</p>
<p align="center">
  <a href="https://github.com/Cansiny0320/Nexlet/releases">下载与发行记录</a> ·
  <a href="https://github.com/Cansiny0320/Nexlet-plugins">插件市场仓库</a> ·
  <a href="docs/plugin-sdk.md">插件开发</a> ·
  <a href="website/README.md">官网</a>
</p>

Nexlet 是一个开源桌面工具箱，提供应用与快捷方式搜索、剪贴板、计算稿纸、JSON 工具和可扩展插件。主窗口保留搜索、最近使用和固定工具，常用工具可以分离成独立窗口。

![Nexlet 启动器](docs/screenshots/launcher.png)

## 几个随手就能完成的操作

| 输入或操作 | Nexlet 会做什么 |
| --- | --- |
| `Alt+Space` 后输入应用名、拼音或首字母 | 查找应用、系统快捷方式、网页与插件指令 |
| 输入 `128*3` | 显示结果 `384`，可继续在计算稿纸里逐行计算 |
| 打开「剪贴板」 | 搜索文字、图片和文件历史，收藏、复制或回贴到之前的应用 |
| 打开「JSON 工具」 | 双栏编辑与树形格式化；对比两份 JSON，红色表示删除，绿色表示新增 |
| 使用「文件搜索」 | 输入关键词后自动启动内置 Everything 引擎，搜索本机文件，无需另装 Everything |
| 打开「插件管理」 | 浏览 GitHub 插件市场，安装、更新或管理本地插件 |

其他预装工具包括时间戳、URL / Base64、UUID 和网页快开。预装工具随应用提供，离线也能打开。

<table>
<tr><td><img src="docs/screenshots/scratchpad.png" alt="逐行计算稿纸"></td><td><img src="docs/screenshots/clipboard.png" alt="剪贴板历史"></td></tr>
<tr><td align="center">续算、备注、锁定和自动保存</td><td align="center">文本、图片、文件与收藏</td></tr>
<tr><td><img src="docs/screenshots/json-diff.png" alt="JSON 红绿差异对比"></td><td><img src="docs/screenshots/marketplace-live.png" alt="真实插件市场"></td></tr>
<tr><td align="center">JSON 对比与键顺序选项</td><td align="center">独立数据与安装权限说明</td></tr>
</table>

## 下载和开始使用

构建产物位于 [GitHub Releases](https://github.com/Cansiny0320/Nexlet/releases) 或通过检查的 [Actions 运行记录](https://github.com/Cansiny0320/Nexlet/actions/workflows/release.yml)。标签构建先生成 Release 草稿；草稿公开发布前，开发预览包从 Actions artifacts 获取，需要登录 GitHub。

| 平台 | 产物 | 当前验证范围 |
| --- | --- | --- |
| Windows x64 | 单文件便携 `.exe` | 本机集成测试、真实外部回贴、便携包启动检查 |
| macOS Apple Silicon | arm64 `.dmg` | 原生 CI 构建与打包后启动检查 |
| macOS Intel | x64 `.dmg` | 原生 CI 构建与打包后启动检查 |
| Linux | 暂无发行包 | 基础界面；文件剪贴板和自动回贴尚未实现 |

Windows 运行便携 EXE 即可。首次解压会稍慢，关闭主窗口后程序保留在托盘，右键托盘可退出。Windows 包未做数字签名。macOS 包使用 ad-hoc 签名，尚未完成 Developer ID 签名、公证，以及真实桌面回贴和系统权限流程验收。

默认使用 `Alt+Space` 唤起。如果被其他程序占用，在右上角设置中换成 `Ctrl+Alt+Space`；Nexlet 会提示冲突，不会修改其他程序的配置。独立工具窗口支持置顶，主启动器不显示置顶按钮。

设置中提供「开机自启动」开关，开启后随系统登录在后台运行。Windows 便携版请放在固定位置后再开启；移动 EXE 后需要重新开启开关。状态直接读取系统设置，不会在首次运行时自动登记。macOS 如需系统批准，会在设置页提示。

便携版更新时，先从托盘选择「退出 Nexlet」，再运行新版 EXE；直接双击新版会唤起仍在运行的旧实例。JSON 临时输入请在退出前复制保留。标题栏左侧手柄、工具名称及空白处可拖动窗口，按钮和输入框保留原有交互。

### 文件搜索

Windows 版随包提供官方稳定版 Everything 便携引擎。首次输入搜索词时，Nexlet 启动自己的后台实例，默认以普通权限索引本地固定磁盘中可访问的文件。空输入保持待输入状态；索引尚未就绪时显示等待提示并自动重试。可在设置中添加目录，将索引范围缩小到工作文件夹。

首次扫描可能需要几分钟或更久，界面会显示建立索引状态。这种无需安装服务的文件夹索引，比 Everything 原生 NTFS 索引的首次扫描慢。Nexlet 不安装 Windows 服务、不添加系统启动项，也不控制用户另外安装的 Everything。退出 Nexlet 时一并关闭自己的索引进程。macOS 暂不提供 Everything 文件搜索。

### 几个实用快捷操作

- 搜索结果右键固定到首页；拖入文件或粘贴图片可以收进剪贴板。
- 计算稿纸中 `Enter` 将结果带入下一行，`Ctrl/Cmd+B` 添加备注，`Ctrl/Cmd+N` 新建稿纸。
- 剪贴板支持 `Ctrl/Cmd` 或 `Shift` 多选、文本合并复制、文件路径去重与悬浮中转。
- 自动回贴需要先在目标应用中按快捷键打开 Nexlet；macOS 需要辅助功能权限。目标窗口不可用时会提示，仍可手动粘贴。
- JSON 支持 50 万字符以内的内容，保留大整数原文；忽略对象键顺序可选，数组顺序始终参与比较。

## 插件市场与开发

公开市场由 [Nexlet-plugins](https://github.com/Cansiny0320/Nexlet-plugins) 托管，目录来自版本化 JSON，安装包来自 GitHub Releases。当前提供可直接使用的「便笺」插件。安装时显示所需权限；更新保留独立数据，下载失败或取消不会替换旧版本。市场列表有本地缓存，不会自动更新已安装插件。

外部插件使用 Nexlet 自有 API，由 HTML、CSS、JavaScript 和 `plugin.json` 组成。支持开发目录与 `.zip` / `.nexlet` 包导入。插件在独立沙箱窗口运行，没有 Node.js、任意宿主 IPC 或直接联网能力。

从 [`examples/hello-nexlet`](examples/hello-nexlet) 开始，在「插件管理 → 已安装 → 加载开发目录」中选择它。完整 API、权限、图标和打包规则见 [插件 SDK](docs/plugin-sdk.md)。Nexlet 不兼容 uTools 插件 API。

## 数据属于本机

剪贴板、稿纸、设置和插件数据存储在本机，没有账号、云同步或遥测。插件市场联网仅用于获取目录和插件包；JSON 内容与文件搜索关键词不上传。

| 平台 | 默认数据目录 |
| --- | --- |
| Windows | `%APPDATA%/Nexlet` |
| macOS | `~/Library/Application Support/Nexlet` |

设置中的「打开数据目录」可直接定位。备份前退出 Nexlet，再复制整个目录。数据没有额外加密；剪贴板默认保留 500 条非收藏记录、30 天，收藏不会自动清理。文件历史只保存路径，不复制原文件。

## 本地开发

需要 Node.js 24+ 和 npm，CI 使用 [.node-version](.node-version)。Electron 44 使用异步剪贴板 API。

```sh
npm ci
npm start
```

```sh
npm run typecheck       # 类型检查
npm test                # 逻辑、数据和边界测试
npm run test:e2e         # Windows 桌面集成测试，会构建应用
npm run package:win     # Windows x64 便携包
npm run package:mac     # 在 Mac 上构建通用 DMG
```

`test:e2e` 使用 `.tmp` 中的隔离数据和文件夹索引，不扫描用户磁盘；会暂时使用剪贴板并恢复可读取的原内容。实时 GitHub 市场验收可在构建后运行 `node scripts/smoke-marketplace.mjs`。原生回贴专项与平台限制见 [验证记录](docs/validation.md)。

仓库结构：`src/main` 为桌面宿主，`src/renderer` 为界面，`src/preload` 为受限桥接，`src/shared` 为共享类型与逻辑，`website` 为官网，`tests` 为回归测试。

## CI 与发版

[Build and Release](.github/workflows/release.yml) 覆盖 Windows x64、macOS Intel 和 Apple Silicon：类型检查、单元测试、原生打包、实际启动；Windows 额外运行桌面集成与便携 EXE 验证。普通提交和手动运行上传保留 14 天的 artifacts。

发版时更新 `package.json` 和 `package-lock.json` 的版本，提交后推送匹配的 `v*` 标签。CI 验证标签一致性，生成三个安装包、示例插件与 `SHA256SUMS.txt`，创建 **Release 草稿**，审核后手动公开发布。重跑可更新草稿，不覆盖已发布版本。不需要额外 PAT，也没有配置应用自动更新。

贡献方式见 [CONTRIBUTING.md](CONTRIBUTING.md)。问题与建议可提交到 [Issues](https://github.com/Cansiny0320/Nexlet/issues)。

## 许可证

Nexlet 使用 [MIT License](LICENSE)，允许使用、修改和分发。Everything、ES 与其他第三方组件保留各自许可证，见 [第三方组件说明](assets/vendor/everything/README.md)。
