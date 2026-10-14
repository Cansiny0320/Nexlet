Nexlet 0.2.22 修复 Windows 应用内更新的安装器启动与失败处理。

## 更新与安装

- 点击「重启更新」后，确认安装器进程启动再退出 Nexlet；使用提权助手时，等待助手成功交接安装器。
- 安装器无法启动、缓存文件丢失或提权取消时，保留应用并显示错误，不再通过 Windows Shell 尝试打开失败路径。
- 使用安装器的真实路径和有效工作目录，避免继承失效或虚拟化的工作目录。
- 保留静默安装、安装后自动重新打开，以及安装前保存数据的流程。
- 此修复由发起更新的客户端执行。从旧版本升级到 0.2.22 时仍使用旧版更新逻辑；安装 0.2.22 后，后续应用内更新才使用修复后的流程。

## 下载

- Windows x64：安装版 Nexlet-0.2.22-Windows-x64-Setup.exe；便携版 Nexlet-0.2.22-Windows-x64.exe。
- Apple Silicon Mac：Nexlet-0.2.22-macOS-arm64.dmg。
- Intel Mac：Nexlet-0.2.22-macOS-x64.dmg。
- Linux x64：Nexlet-0.2.22-Linux-x86_64.AppImage、Nexlet-0.2.22-Linux-amd64.deb。
- Linux arm64：Nexlet-0.2.22-Linux-arm64.AppImage、Nexlet-0.2.22-Linux-arm64.deb。
- macOS ZIP、blockmap 与 latest*.yml 用于应用内更新；SHA256SUMS.txt 提供文件校验值。

手动安装前建议完整退出旧版。现有本地数据继续使用原用户目录。

Windows 尚无代码签名。macOS 使用固定签名身份，但未经 Apple Developer ID 签名与公证。Linux 桌面集成以 X11 为主要验证环境，Wayland 的已知限制见仓库 docs/linux.md。
