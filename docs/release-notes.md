Nexlet 0.2.45 减少 macOS 超级面板对鼠标移动和拖动的干扰，并默认隐藏 Dock 图标。

## 修复

- macOS 超级面板只监听触发手势所需的鼠标事件，普通移动和左键拖动不再经过同步回调，减少外接鼠标拖动卡顿。
- 保留右键长按、中键触发、面板内拖动选择和外部点击关闭行为。
- macOS 普通启动和登录启动默认隐藏 Dock 图标，重复唤起后仍可正常输入。

## English

Nexlet 0.2.45 reduces mouse movement and dragging delays on macOS by limiting Super Panel's event listener to the events its gestures need. Ordinary movement and left-button dragging now bypass the synchronous callback. Right-button hold, middle-button activation, panel drag selection, and dismissal on outside clicks remain available. The macOS Dock icon is now hidden by default for both normal and login startup.

## 下载

- Windows x64：安装包 Nexlet-0.2.45-Windows-x64-Setup.exe；便携包 Nexlet-0.2.45-Windows-x64.exe。
- Apple Silicon Mac：Nexlet-0.2.45-macOS-arm64.dmg。
- Intel Mac：Nexlet-0.2.45-macOS-x64.dmg。
- Linux x64：Nexlet-0.2.45-Linux-x86_64.AppImage、Nexlet-0.2.45-Linux-amd64.deb。
- Linux arm64：Nexlet-0.2.45-Linux-arm64.AppImage、Nexlet-0.2.45-Linux-arm64.deb。
- macOS ZIP、blockmap 和 latest*.yml 用于应用内更新；SHA256SUMS.txt 提供文件校验值。

手动安装前请先完全退出旧版。现有本地数据继续使用原用户目录。

Windows 暂无代码签名；macOS 使用固定签名身份，但未经 Apple Developer ID 签名与公证。Linux 桌面集成以 X11 为主要验证环境，Wayland 的已知限制见仓库 docs/linux.md。
