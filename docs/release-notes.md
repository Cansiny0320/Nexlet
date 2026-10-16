Nexlet 0.2.32 修复 Windows 部分应用显示通用图标的问题，并在升级时刷新旧图标缓存。

## Windows 应用图标

- 优先从 Windows 程序和资源文件中原生提取图标，修复 Bifrost、Clash Verge 等应用显示通用程序图标的问题。
- 按快捷方式指定的图标索引读取资源，支持正向索引和负数资源 ID；资源不可用时继续尝试目标程序及系统图标。
- 保留图标透明度，提取完成或失败后释放原生图标与绘图资源。

## 图标缓存升级

- 升级时自动清除旧版图标缓存，重新读取应用图标；保留应用目录和快捷方式别名，继续支持快速启动。
- 新图标继续持久化保存，不会在每次启动时重复清空。

## 已知限制

- Control Panel、Run、Windows Media Player Legacy 等特殊快捷方式仍可能显示通用图标，其读取兼容问题尚未修复。
- 快捷方式的目标程序和图标资源已不存在，或程序没有内置图标资源时，仍显示系统占位图标。本版本不会自动删除这些快捷方式。

## English

Windows now extracts application icons directly from native resources before falling back to generic file icons. Shortcut icon indexes, negative resource IDs and transparency are preserved. Upgrading invalidates old icon bitmaps while retaining the application catalog and shortcut aliases; newly loaded icons remain cached across restarts.

Some special Windows shortcuts, including Control Panel, Run and Windows Media Player Legacy, may still display generic icons. Missing targets and applications without icon resources also retain placeholders; shortcuts are not automatically deleted.

## 下载

- Windows x64：安装包 Nexlet-0.2.32-Windows-x64-Setup.exe；便携包 Nexlet-0.2.32-Windows-x64.exe。
- Apple Silicon Mac：Nexlet-0.2.32-macOS-arm64.dmg。
- Intel Mac：Nexlet-0.2.32-macOS-x64.dmg。
- Linux x64：Nexlet-0.2.32-Linux-x86_64.AppImage、Nexlet-0.2.32-Linux-amd64.deb。
- Linux arm64：Nexlet-0.2.32-Linux-arm64.AppImage、Nexlet-0.2.32-Linux-arm64.deb。
- 可选离线 OCR 在插件市场安装，需要 Nexlet 0.2.30 或更新版本；源码、测试和独立版本发布统一在 [插件仓库](https://github.com/Cansiny0320/Nexlet-plugins/tree/main/plugins/ocr) 维护，并由插件 Release 提供安装包。
- macOS ZIP、blockmap 和 latest*.yml 用于应用内更新；SHA256SUMS.txt 提供文件校验值。

手动安装前请先完全退出旧版。现有本地数据继续使用原用户目录。

Windows 暂无代码签名；macOS 使用固定签名身份，但未做 Apple Developer ID 签名与公证。Linux 桌面集成以 X11 为主要验证环境，Wayland 的已知限制见仓库 docs/linux.md。
