Nexlet 0.2.19 精简窗口布局入口，为 OCR 功能提供更直观的文字扫描图标，并修复 Windows 安装器图标。

## 界面改进

- 从工具目录和搜索结果中移除分屏、窗口居中、最大化、恢复位置及移屏入口。
- 截图 OCR 识别、截图 OCR 识别复制、OCR 文字识别和 OCR 识别复制统一使用文字扫描图标，网格与列表展示保持一致。
- Windows 安装及卸载窗口使用 Nexlet 图标。

## 下载与安装

- Windows x64：安装版 Nexlet-0.2.19-Windows-x64-Setup.exe，便携版 Nexlet-0.2.19-Windows-x64.exe。
- Apple Silicon Mac：Nexlet-0.2.19-macOS-arm64.dmg。
- Intel Mac：Nexlet-0.2.19-macOS-x64.dmg。
- Linux x64：Nexlet-0.2.19-Linux-x86_64.AppImage、Nexlet-0.2.19-Linux-amd64.deb。
- Linux arm64：Nexlet-0.2.19-Linux-arm64.AppImage、Nexlet-0.2.19-Linux-arm64.deb。
- macOS ZIP、blockmap 与 latest*.yml 用于应用内更新；SHA256SUMS.txt 提供文件校验值。

手动安装前请完整退出旧版。现有本地数据继续使用原用户目录。

Windows 尚无代码签名；macOS 使用固定签名身份，但尚无 Apple Developer ID 签名与公证。Linux 桌面集成以 X11 为主要验证环境，Wayland 的兼容限制见仓库 docs/linux.md。
