Nexlet 0.2.38 修复 macOS Option 组合快捷键的录制问题。

## 快捷键录制修复

- 修复录制时把 Option 组合键产生的 `∆`、`å` 等字符误当成快捷键主键，导致保存后无法注册的问题。
- 全局唤醒和功能快捷键统一按基础键位记录 macOS Option 组合键，覆盖字母、数字、标点及重音键。
- 保留手动编辑、快捷键显示名称及现有存储格式；Windows 和 Linux 的录制行为不变。
- 将选区开关文案改为「快捷键启动时带入选中内容」，同步更新英文与繁体中文翻译。

## English

Nexlet 0.2.38 fixes macOS Option shortcut recording. Global wake and command shortcuts now record the base key instead of Option-generated symbols or dead-key text, preventing invalid shortcuts such as Control+Alt+∆. Manual editing, display labels, stored accelerator format, and Windows/Linux recording behavior remain unchanged. The selection option now says "Use selected content when launching with a shortcut", with matching Simplified and Traditional Chinese labels.

## 下载

- Windows x64：安装包 Nexlet-0.2.38-Windows-x64-Setup.exe；便携包 Nexlet-0.2.38-Windows-x64.exe。
- Apple Silicon Mac：Nexlet-0.2.38-macOS-arm64.dmg。
- Intel Mac：Nexlet-0.2.38-macOS-x64.dmg。
- Linux x64：Nexlet-0.2.38-Linux-x86_64.AppImage、Nexlet-0.2.38-Linux-amd64.deb。
- Linux arm64：Nexlet-0.2.38-Linux-arm64.AppImage、Nexlet-0.2.38-Linux-arm64.deb。
- macOS ZIP、blockmap 和 latest*.yml 用于应用内更新；SHA256SUMS.txt 提供文件校验值。

手动安装前请先完全退出旧版。现有本地数据继续使用原用户目录。

Windows 暂无代码签名；macOS 使用固定签名身份，但未经 Apple Developer ID 签名与公证。Linux 桌面集成以 X11 为主要验证环境，Wayland 的已知限制见仓库 docs/linux.md。
