Nexlet 0.2.34 补齐 6 个系统操作图标，与上一版的系统设置图标保持一致。

## 系统操作图标

- 锁屏、睡眠、重启、关机、注销、显示桌面改用独立生成的彩色透明图标。
- 统一固定、最近使用和搜索结果中的图标，适配浅色、深色主题及小尺寸显示。
- 系统操作的执行方式与确认规则保持不变；翻译等插件继续使用插件自带图标。

## 稳定性修复

- 包含主分支已合入的异步便笺保存、插件状态与更新流程相关修复。

## English

All six system actions—Lock, Sleep, Restart, Shut down, Sign out and Show desktop—now use distinct generated color icons with transparent backgrounds. They match the system-settings artwork from the previous release and remain clear in light and dark themes at small sizes. Action execution and confirmation behavior are unchanged. This release also includes the asynchronous scratchpad, plugin-state and updater fixes already merged into main.

## 下载

- Windows x64：安装包 Nexlet-0.2.34-Windows-x64-Setup.exe；便携包 Nexlet-0.2.34-Windows-x64.exe。
- Apple Silicon Mac：Nexlet-0.2.34-macOS-arm64.dmg。
- Intel Mac：Nexlet-0.2.34-macOS-x64.dmg。
- Linux x64：Nexlet-0.2.34-Linux-x86_64.AppImage、Nexlet-0.2.34-Linux-amd64.deb。
- Linux arm64：Nexlet-0.2.34-Linux-arm64.AppImage、Nexlet-0.2.34-Linux-arm64.deb。
- 可选离线 OCR 在插件市场安装，需要 Nexlet 0.2.30 或更新版本；源码、测试和独立版本发布统一在 [插件仓库](https://github.com/Cansiny0320/Nexlet-plugins/tree/main/plugins/ocr) 维护，并由插件 Release 提供安装包。
- macOS ZIP、blockmap 和 latest*.yml 用于应用内更新；SHA256SUMS.txt 提供文件校验值。

手动安装前请先完全退出旧版。现有本地数据继续使用原用户目录。

Windows 暂无代码签名；macOS 使用固定签名身份，但未做 Apple Developer ID 签名与公证。Linux 桌面集成以 X11 为主要验证环境，Wayland 的已知限制见仓库 docs/linux.md。
