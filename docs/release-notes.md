Nexlet 0.2.17 修复 Windows 超级面板鼠标监听延迟，并改进应用更新与剪贴板历史。

## 本次修复

- Windows 超级面板改为在鼠标事件到达时唤醒监听线程，移除定时轮询带来的输入等待；保留长按右键打开面板、普通短按右键菜单和中键触发。
- 更新监听线程的控制消息处理，确保忙碌状态、排除应用、面板范围和关闭监听仍然生效。新增模拟原生事件的回归测试，不向真实桌面发送鼠标输入。
- 修复差分更新时下载进度可能把本地复制的数据计入下载量的问题。
- Windows 更新安装使用安装文件的实际路径，兼容 AppData 路径重定向。
- 再次复制已有剪贴板记录时，将记录移到最近位置，并显示精确时间。

## 下载与安装

- Windows x64：安装版 Nexlet-0.2.17-Windows-x64-Setup.exe，便携版 Nexlet-0.2.17-Windows-x64.exe。
- Apple Silicon Mac：Nexlet-0.2.17-macOS-arm64.dmg。
- Intel Mac：Nexlet-0.2.17-macOS-x64.dmg。
- Linux x64：Nexlet-0.2.17-Linux-x86_64.AppImage、Nexlet-0.2.17-Linux-amd64.deb。
- Linux arm64：Nexlet-0.2.17-Linux-arm64.AppImage、Nexlet-0.2.17-Linux-arm64.deb。
- macOS ZIP、blockmap 与 latest*.yml 用于应用内更新；SHA256SUMS.txt 提供文件校验值。

手动安装前请完整退出旧版。现有本地数据继续使用原用户目录。

Windows 尚无代码签名；macOS 使用固定签名身份，但尚无 Apple Developer ID 签名与公证。Linux 桌面集成以 X11 为主要验证环境，Wayland 的兼容限制见仓库 docs/linux.md。
