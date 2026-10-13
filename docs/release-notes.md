Nexlet 0.2.16 新增可配置启动器、超级面板、离线 OCR 和 Linux 安装包，并扩展插件能力。

## 启动器与桌面工具

- 支持指令别名、独立快捷键、本地应用入口和网页搜索模板。
- 新增划词取词与超级面板，可配置常用功能、分组和触发方式。
- 新增窗口布局、截图和图片工具；内置 PaddleOCR.js 与 PP-OCRv6 模型，图片文字识别离线运行。
- 首页整条搜索栏支持拖动窗口，保留点击和输入；macOS 使用原生窗口拖动。
- 修复普通搜索打开计算稿纸时把搜索词误作公式的问题，恢复已有稿纸；划词内容仍可正常传入工具。

## 插件与稳定性

- 扩展插件 SDK，支持隔离后端及宿主能力服务。
- 退出时完成插件持久化，并等待原生操作取消后再结束进程。
- 修复插件页面加载中退出时的取消竞态，取消后仍可正常重新打开。
- 沿用市场插件打开时自动更新的机制，保留本地配置和本次输入。

## 平台与下载

- Windows x64：安装版 `Nexlet-0.2.16-Windows-x64-Setup.exe`，便携版 `Nexlet-0.2.16-Windows-x64.exe`。
- Apple Silicon Mac：`Nexlet-0.2.16-macOS-arm64.dmg`。
- Intel Mac：`Nexlet-0.2.16-macOS-x64.dmg`。
- Linux x64：`Nexlet-0.2.16-Linux-x86_64.AppImage`、`Nexlet-0.2.16-Linux-amd64.deb`。
- Linux arm64：`Nexlet-0.2.16-Linux-arm64.AppImage`、`Nexlet-0.2.16-Linux-arm64.deb`。
- macOS ZIP、blockmap 和 `latest*.yml` 用于应用内更新；`SHA256SUMS.txt` 提供下载校验值。

Linux 的桌面能力以 X11 为主要验证环境，GNOME/KDE Wayland 的能力限制见仓库 `docs/linux.md`。

手动安装前请从托盘退出旧版，已有本地数据沿用原数据目录。Windows 便携 EXE 请放在固定位置。

Windows 包没有数字签名；macOS 包沿用固定签名身份，但没有 Apple Developer ID 签名或公证。
