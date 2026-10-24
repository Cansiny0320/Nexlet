<p align="center"><img src="assets/icon.png" width="76" alt="Nexlet"></p>
<h1 align="center">Nexlet</h1>
<p align="center">按下快捷键，把常用工具带到手边。</p>
<p align="center">
  <a href="https://github.com/Cansiny0320/Nexlet/releases/latest"><img src="https://img.shields.io/github/v/release/Cansiny0320/Nexlet" alt="Latest release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-6875e9" alt="Windows, macOS and Linux">
</p>
<p align="center">
  <a href="https://github.com/Cansiny0320/Nexlet/releases/latest">下载</a> ·
  <a href="https://github.com/Cansiny0320/Nexlet-plugins">插件市场</a> ·
  <a href="https://github.com/Cansiny0320/Nexlet/issues">问题反馈</a> ·
  <a href="https://nexlet.cansiny0320.chatgpt.site">官网</a>
</p>
<p align="center">
  <a href="README.md">简体中文</a> ·
  <a href="README.zh-Hant.md">繁體中文</a> ·
  <a href="README.en.md">English</a>
</p>

Nexlet 是一个开源桌面工具箱。找应用、翻剪贴板、做计算、处理 JSON，都可以从同一个搜索框开始；需要常驻的工具，还能分离成独立窗口。支持 Windows、macOS 和 Linux。

![Nexlet 启动器](docs/screenshots/launcher.png)

## Nexlet 能帮你做什么？

- **少找几个窗口**：按快捷键搜索应用、文件、网页和插件指令，支持中文、英文、拼音与首字母。
- **找回刚才复制的内容**：搜索文字、图片和文件历史，收藏常用内容，再复制或回贴到之前的应用。
- **随手计算和处理文本**：输入 `128*3` 直接得到 `384`，也可以打开计算稿纸逐行计算，或用 JSON 工具格式化、查看和对比数据。
- **按需要添加工具**：从插件市场安装便笺、翻译、字数统计、离线 OCR 等工具，常用工具可以固定到首页。

## 快速开始

**1 · 下载并安装。** 前往 [最新版本](https://github.com/Cansiny0320/Nexlet/releases/latest)，选择适合自己系统的安装包。

| 系统                | 下载选择                                 |
| ------------------- | ---------------------------------------- |
| Windows x64         | 安装版 `Setup.exe` 或免安装的便携 `.exe` |
| macOS Apple Silicon | `arm64.dmg`                              |
| macOS Intel         | `x64.dmg`                                |
| Linux x64 / arm64   | AppImage 或 `.deb`                       |

Windows 安装包尚未数字签名，macOS 版本尚未经过 Apple 公证。Mac 首次打开遇到系统提示时，请参考 [首次打开说明](docs/mac-first-open.md)。Linux 安装与桌面环境限制见 [Linux 使用说明](docs/linux.md)。

**2 · 按快捷键唤起。** Windows / Linux 默认使用 `Alt+Space`，macOS 使用 `Option+Space`。输入应用名或工具名即可搜索；快捷键可在设置中修改。

**3 · 从一件小事开始。** 输入算式、打开「剪贴板」找回一段文字，或把图片、文件拖进启动器，选择能处理它的工具。常用搜索结果可以右键固定到首页。

点击启动器右上角 Nexlet 图标进入设置，可以切换简体中文、繁体中文或 English，调整唤起快捷键，也可以开启开机自启动。

## 常用工具

### 新增效率功能（v0.2.42）

当前源码新增快捷短语、工作区、配置导入导出、AI 动作、图片文字搜索、工具状态恢复，以及富文本历史、动作菜单、搜索、记录控制和文件预览改进。使用方法与边界见 [效率功能说明](docs/productivity.md)。

### 剪贴板与计算稿纸

剪贴板保存文字、图片和文件历史，支持搜索、收藏、多选与合并复制。计算稿纸支持逐行计算、续算、备注和自动保存；按 `Enter` 可以把结果带入下一行。

<table>
<tr><td width="50%"><img src="docs/screenshots/clipboard.png" alt="剪贴板历史"></td><td width="50%"><img src="docs/screenshots/scratchpad.png" alt="计算稿纸"></td></tr>
<tr><td align="center">找回文字、图片和文件</td><td align="center">逐行计算，保留过程与备注</td></tr>
</table>

### JSON 与文件搜索

JSON 工具支持双栏编辑、树形查看和差异对比，用红色标记删除、绿色标记新增；对比时可选择忽略对象键顺序。

文件搜索支持打开文件、定位文件夹、复制路径和浏览目录。Windows 内置 Everything 引擎，首次使用需要等待索引；macOS 使用 Spotlight，搜索范围受系统索引影响；Linux 需要先在设置中添加搜索目录。

![JSON 差异对比](docs/screenshots/json-diff.png)

时间戳、URL / Base64、UUID 等常用工具也随应用提供，离线即可使用。需要边看边用时，点击工具标题栏的「分离为独立窗口」，还可以将窗口置顶。

### 插件市场

打开「插件管理」即可浏览、安装和更新插件，也支持导入本地 `.zip` / `.nexlet` 插件包。市场中的工具包括便笺、字数统计、翻译和离线 OCR，具体以市场列表为准；离线 OCR 需要 Nexlet 0.2.30 或更新版本。

![Nexlet 插件市场](docs/screenshots/marketplace-live.png)

市场安装的插件会在重新打开时检查兼容更新，更新失败时继续使用旧版。Nexlet 使用自己的插件体系，不兼容 uTools `.upx` 插件。

## 使用提示

- **回贴到原应用**：在目标应用里按快捷键打开 Nexlet，再选择剪贴板内容。macOS 需要在「系统设置 → 隐私与安全性 → 辅助功能」中允许 Nexlet；未授权时仍可复制后手动粘贴。
- **应用更新**：设置中可手动检查更新，也可开启自动检查。发现新版后，由你选择下载和重启安装。Windows 便携版与 Linux `.deb` 需要下载后手动替换或安装。
- **退出与替换便携版**：关闭主窗口后，Nexlet 会保留在托盘。替换 Windows 便携版前，请先从托盘选择「退出 Nexlet」。重启前记得保留 JSON 等临时输入。
- **Linux 桌面差异**：Wayland 下的全局快捷键和剪贴板能力取决于桌面权限，自动回贴需改用手动粘贴。详细说明见 [Linux 使用说明](docs/linux.md#x11-与-wayland)。

## 数据与隐私

剪贴板、稿纸、设置和插件数据保存在本机。Nexlet 本身没有账号、云同步或遥测，JSON 工具与本机文件搜索不会上传输入内容。应用更新和插件市场会访问 GitHub；翻译等联网插件会把请求内容发送给所使用的服务。

在设置中选择「打开数据目录」即可找到本地数据。需要备份时，先退出 Nexlet，再复制整个目录。普通剪贴板、稿纸和插件数据没有额外加密；文件历史只保存路径，不复制原文件。

## 反馈与参与

遇到问题或有功能建议，欢迎提交 [Issue](https://github.com/Cansiny0320/Nexlet/issues)，并附上系统、Nexlet 版本和复现步骤。

想参与项目，可以查看 [贡献指南](CONTRIBUTING.md)；想制作插件，可以查看 [插件 SDK](docs/plugin-sdk.md) 和 [插件仓库](https://github.com/Cansiny0320/Nexlet-plugins)。

## 赞助

如果这个项目对你有帮助，欢迎通过微信或支付宝支持后续开发。感谢你的支持！

![微信与支付宝赞助二维码](.github/sponsorship/sponsorship-cats.png)

[猫猫](.github/sponsorship/sponsorship-cats.png) · [一二布布](.github/sponsorship/sponsorship-yier-bubu.png) · [水豚噜噜](.github/sponsorship/sponsorship-lulu.png)

## 许可证

Nexlet 使用 [MIT License](LICENSE)。Everything、ES 与其他第三方组件保留各自许可证，见 [第三方组件说明](assets/vendor/everything/README.md)。
