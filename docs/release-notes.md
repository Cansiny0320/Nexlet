Nexlet 0.2.33 重新设计全部系统设置入口图标，减少重复图形，让设置更容易辨认。

## 系统设置图标

- 78 个系统设置入口使用全新生成的轻立体彩色图标，覆盖 Windows 的 70 个设置及 macOS 的 8 个专有入口。
- 网络、账户、辅助功能、个性化等入口各有独立图形，不再大量重复使用通用滑杆图标。
- 采用透明图片，适配深浅主题和小尺寸显示；固定、最近使用与搜索结果保持一致。
- Windows 和 macOS 的系统设置统一使用这套图标，其他应用、插件和工具的图标行为不变。

## 系统操作确认

- 睡眠、重启、关机等系统操作的确认对话框默认聚焦“确认”；取消按钮和 Esc 仍可取消操作。

## 已知限制

- Control Panel、Run、Windows Media Player Legacy 等特殊快捷方式仍可能显示通用图标；本次系统设置图标替换不改变这些快捷方式的资源读取方式。
- 目标程序或图标资源缺失的快捷方式继续显示占位图标，不会被自动删除。

## English

All 78 system-settings entries now use distinct, generated color icons with transparent backgrounds. The artwork covers 70 Windows settings and eight additional macOS settings, with consistent rendering in pinned items, recent items and search results. Other application, plugin and tool icons retain their existing behavior.

System-action dialogs now focus Confirm by default; Cancel and Escape still dismiss the action. Some special Windows shortcuts may still display generic icons, and shortcuts with missing resources retain their placeholders.

## 下载

- Windows x64：安装包 Nexlet-0.2.33-Windows-x64-Setup.exe；便携包 Nexlet-0.2.33-Windows-x64.exe。
- Apple Silicon Mac：Nexlet-0.2.33-macOS-arm64.dmg。
- Intel Mac：Nexlet-0.2.33-macOS-x64.dmg。
- Linux x64：Nexlet-0.2.33-Linux-x86_64.AppImage、Nexlet-0.2.33-Linux-amd64.deb。
- Linux arm64：Nexlet-0.2.33-Linux-arm64.AppImage、Nexlet-0.2.33-Linux-arm64.deb。
- 可选离线 OCR 在插件市场安装，需要 Nexlet 0.2.30 或更新版本；源码、测试和独立版本发布统一在 [插件仓库](https://github.com/Cansiny0320/Nexlet-plugins/tree/main/plugins/ocr) 维护，并由插件 Release 提供安装包。
- macOS ZIP、blockmap 和 latest*.yml 用于应用内更新；SHA256SUMS.txt 提供文件校验值。

手动安装前请先完全退出旧版。现有本地数据继续使用原用户目录。

Windows 暂无代码签名；macOS 使用固定签名身份，但未做 Apple Developer ID 签名与公证。Linux 桌面集成以 X11 为主要验证环境，Wayland 的已知限制见仓库 docs/linux.md。
