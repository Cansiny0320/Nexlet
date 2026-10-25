Nexlet 0.2.46 修复 Windows 下目录删除后后台 CPU 持续偏高的问题，并改善计算草稿纸的输入焦点。

## 修复

- 应用目录被删除或替换时，及时关闭失效监听，避免反复处理目录通知而持续占满一个 CPU 核心。
- 监听清理不再等待应用目录扫描完成；重复事件合并检查，目录替换后重新绑定监听。
- 从启动器打开计算草稿纸时，自动聚焦表达式输入区域，方便继续输入。

## English

Nexlet 0.2.46 fixes sustained high CPU usage on Windows after a watched application directory is deleted or replaced. Invalid watchers are now closed independently of catalog scans, repeated events share an identity check, and replacement directories are watched again. Opening Scratchpad from the launcher now focuses the expression input.

## 下载

- Windows x64：安装版 Nexlet-0.2.46-Windows-x64-Setup.exe；便携版 Nexlet-0.2.46-Windows-x64.exe。
- Apple Silicon Mac：Nexlet-0.2.46-macOS-arm64.dmg。
- Intel Mac：Nexlet-0.2.46-macOS-x64.dmg。
- Linux x64：Nexlet-0.2.46-Linux-x86_64.AppImage；Nexlet-0.2.46-Linux-amd64.deb。
- Linux arm64：Nexlet-0.2.46-Linux-arm64.AppImage；Nexlet-0.2.46-Linux-arm64.deb。
- macOS ZIP、blockmap 和 latest*.yml 用于应用内更新；SHA256SUMS.txt 提供文件校验值。

手动安装前请先完全退出旧版。现有本地数据继续使用原用户目录。

Windows 暂无代码签名；macOS 使用固定签名身份，但未做 Apple Developer ID 签名与公证。Linux 桌面集成以 X11 为主要验证环境，Wayland 的已知限制见仓库 docs/linux.md。
