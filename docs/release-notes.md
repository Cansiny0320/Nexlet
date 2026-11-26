Nexlet 0.2.49 加快了 macOS 剪贴板历史回贴，并修复了新增记录时列表停在旧位置的问题。

## 改进与修复

- macOS 优先使用系统原生键盘事件回贴历史内容，确认目标应用获得焦点后立即发送 `⌘V`。
- 新记录符合当前筛选时，剪贴板历史会自动回到顶部并选中最新记录，按 Enter 即可使用。

## English

Nexlet 0.2.49 speeds up clipboard history paste on macOS by sending a native keyboard event as soon as the target app regains focus. When a new item matches the current filter, the history scrolls to the top and selects the newest item for use with Enter.

## 下载

- Windows x64 安装版为 `Nexlet-0.2.49-Windows-x64-Setup.exe`，便携版为 `Nexlet-0.2.49-Windows-x64.exe`。
- Apple Silicon Mac 使用 `Nexlet-0.2.49-macOS-arm64.dmg`。
- Intel Mac 使用 `Nexlet-0.2.49-macOS-x64.dmg`。
- Linux x64 提供 `Nexlet-0.2.49-Linux-x86_64.AppImage` 和 `Nexlet-0.2.49-Linux-amd64.deb`。
- Linux arm64 提供 `Nexlet-0.2.49-Linux-arm64.AppImage` 和 `Nexlet-0.2.49-Linux-arm64.deb`。
- macOS ZIP、blockmap 和 `latest*.yml` 用于应用内更新。`SHA256SUMS.txt` 提供文件校验值。

手动安装前请完全退出旧版。现有本地数据继续使用原用户目录。云同步默认关闭，需登录后主动选择同步类别。

Windows 尚无代码签名；macOS 使用固定签名身份，但未做 Apple Developer ID 签名与公证。Linux 桌面集成以 X11 为主要验证环境，Wayland 等已知限制见仓库 docs/linux.md。Linux 支持重复截图式手动长图。
