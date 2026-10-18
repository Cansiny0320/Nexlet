Nexlet 0.2.35 精简界面文案，让设置和工具页面更紧凑。

## 界面文案

- 移除设置、剪贴板、超级面板和功能管理中重复解释控件的说明，保留实际错误、权限限制和运行状态。
- 精简网页快开、编码转换、UUID、文件搜索和插件管理页面的重复介绍与操作提示。
- 收紧设置行间距，同步清理 English 和繁體中文文案。

## English

Nexlet 0.2.35 removes redundant descriptions from settings, the pointer panel, command management and tool pages. Settings rows are more compact, with matching cleanup in English and Traditional Chinese. Error messages, permission requirements and live status remain available.

## 下载

- Windows x64：安装包 Nexlet-0.2.35-Windows-x64-Setup.exe；便携包 Nexlet-0.2.35-Windows-x64.exe。
- Apple Silicon Mac：Nexlet-0.2.35-macOS-arm64.dmg。
- Intel Mac：Nexlet-0.2.35-macOS-x64.dmg。
- Linux x64：Nexlet-0.2.35-Linux-x86_64.AppImage、Nexlet-0.2.35-Linux-amd64.deb。
- Linux arm64：Nexlet-0.2.35-Linux-arm64.AppImage、Nexlet-0.2.35-Linux-arm64.deb。
- 可选离线 OCR 在插件市场安装，需要 Nexlet 0.2.30 或更新版本；源码、测试和独立版本发布统一在 [插件仓库](https://github.com/Cansiny0320/Nexlet-plugins/tree/main/plugins/ocr) 维护，并由插件 Release 提供安装包。
- macOS ZIP、blockmap 和 latest*.yml 用于应用内更新；SHA256SUMS.txt 提供文件校验值。

手动安装前请先完全退出旧版。现有本地数据继续使用原用户目录。

Windows 暂无代码签名；macOS 使用固定签名身份，但未做 Apple Developer ID 签名与公证。Linux 桌面集成以 X11 为主要验证环境，Wayland 的已知限制见仓库 docs/linux.md。
