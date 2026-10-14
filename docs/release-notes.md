Nexlet 0.2.21 改进 Windows 安装版的应用内更新体验。

## 更新与安装

- 点击“重启更新”后，静默安装已下载的更新，完成后自动重新打开 Nexlet，不再显示安装向导。
- 安装前仍等待稿纸等内容保存完成；保存失败或超时会阻止安装。
- 检查更新、下载更新和重启安装仍由原有流程控制。
- 本次改动由运行中的客户端执行。从旧版本升级到 0.2.21 时仍可能显示安装窗口；安装 0.2.21 后，后续应用内更新会使用静默安装。

## 下载

- Windows x64：安装版 Nexlet-0.2.21-Windows-x64-Setup.exe；便携版 Nexlet-0.2.21-Windows-x64.exe。
- Apple Silicon Mac：Nexlet-0.2.21-macOS-arm64.dmg。
- Intel Mac：Nexlet-0.2.21-macOS-x64.dmg。
- Linux x64：Nexlet-0.2.21-Linux-x86_64.AppImage、Nexlet-0.2.21-Linux-amd64.deb。
- Linux arm64：Nexlet-0.2.21-Linux-arm64.AppImage、Nexlet-0.2.21-Linux-arm64.deb。
- macOS ZIP、blockmap 和 latest*.yml 用于应用内更新；SHA256SUMS.txt 提供文件校验值。

手动安装前请完整退出旧版。现有本地数据继续使用原用户目录。

Windows 暂无代码签名；macOS 使用固定签名身份，但不含 Apple Developer ID 签名与公证。Linux 桌面集成以 X11 为主要验证环境，Wayland 的已知限制见仓库 docs/linux.md。
