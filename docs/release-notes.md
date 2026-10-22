Nexlet 0.2.44 修复剪贴板图片展开、收起后与相邻记录重叠的问题。

## 修复

- 保留剪贴板条目已测量的高度，避免小图片展开、收起时错误回退到默认行高。
- 图片或文本实际高度变化时，继续自动更新列表位置，使后续图片、文件和文本记录正常排列。
- 补充真实 Electron 回归测试，覆盖小图片反复展开、收起，以及大图片展开后调整窗口宽度的场景。

## English

Nexlet 0.2.44 fixes clipboard entries overlapping after expanding or collapsing images. The list now retains measured row heights when the content size stays unchanged, while continuing to update positions when images or text resize. Electron regression tests cover repeated image expansion and collapse, adjacent file and text entries, and window resizing.

## 下载

- Windows x64：安装包 Nexlet-0.2.44-Windows-x64-Setup.exe；便携包 Nexlet-0.2.44-Windows-x64.exe。
- Apple Silicon Mac：Nexlet-0.2.44-macOS-arm64.dmg。
- Intel Mac：Nexlet-0.2.44-macOS-x64.dmg。
- Linux x64：Nexlet-0.2.44-Linux-x86_64.AppImage、Nexlet-0.2.44-Linux-amd64.deb。
- Linux arm64：Nexlet-0.2.44-Linux-arm64.AppImage、Nexlet-0.2.44-Linux-arm64.deb。
- macOS ZIP、blockmap 和 latest*.yml 用于应用内更新；SHA256SUMS.txt 提供文件校验值。

手动安装前请先完全退出旧版。现有本地数据继续使用原用户目录。

Windows 暂无代码签名；macOS 使用固定签名身份，但未经 Apple Developer ID 签名与公证。Linux 桌面集成以 X11 为主要验证环境，Wayland 的已知限制见仓库 docs/linux.md。
