Nexlet 0.2.36 新增剪贴板 HTML 读取能力，支持「文字表格转图片」插件保留 Excel 单元格样式。

## 文字表格转图片

- 新增独立插件「文字表格转图片」：复制文字或 Excel 单元格后预览，可复制图片或保存高清 PNG；支持调整字号、宽度、内边距和背景色，全部本地处理。
- Excel 表格支持常见单元格样式、边框和合并关系；纯文本表格按制表符还原。图表、浮动图片和完全复刻 Excel 排版不在支持范围。
- 插件 SDK 新增 `clipboard.readHTML()`，沿用 `clipboard.read` 权限，HTML 超过 2 MiB 时拒绝。插件负责清理不可信 HTML。
- 简化设置中的应用更新版本展示。

## English

Nexlet 0.2.36 adds permission-controlled clipboard HTML reading for the new Text & Table to Image plugin. Convert copied text or Excel cells into a high-resolution PNG, preserving supported cell styles and merged cells. Preview, copy or save locally, with adjustable font size, width, padding and background. Charts, floating images and pixel-perfect Excel reproduction are not supported. The application update version display is also simplified.

## 下载

- Windows x64：安装包 Nexlet-0.2.36-Windows-x64-Setup.exe；便携包 Nexlet-0.2.36-Windows-x64.exe。
- Apple Silicon Mac：Nexlet-0.2.36-macOS-arm64.dmg。
- Intel Mac：Nexlet-0.2.36-macOS-x64.dmg。
- Linux x64：Nexlet-0.2.36-Linux-x86_64.AppImage、Nexlet-0.2.36-Linux-amd64.deb。
- Linux arm64：Nexlet-0.2.36-Linux-arm64.AppImage、Nexlet-0.2.36-Linux-arm64.deb。
- 「文字表格转图片」通过插件市场独立安装，或从 [插件 Release](https://github.com/Cansiny0320/Nexlet-plugins/releases/tag/org.nexlet.text-image-v1.0.0) 下载。旧宿主可直接粘贴表格，自动读取表格样式需要 Nexlet 0.2.36 或更新版本。
- 可选离线 OCR 在插件市场安装，需要 Nexlet 0.2.30 或更新版本；源码、测试和独立版本发布统一在 [插件仓库](https://github.com/Cansiny0320/Nexlet-plugins/tree/main/plugins/ocr) 维护，并由插件 Release 提供安装包。
- macOS ZIP、blockmap 和 latest*.yml 用于应用内更新；SHA256SUMS.txt 提供文件校验值。

手动安装前请先完全退出旧版。现有本地数据继续使用原用户目录。

Windows 暂无代码签名；macOS 使用固定签名身份，但未做 Apple Developer ID 签名与公证。Linux 桌面集成以 X11 为主要验证环境，Wayland 的已知限制见仓库 docs/linux.md。
