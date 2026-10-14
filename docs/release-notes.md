Nexlet 0.2.20 统一设置页控件，改善启动页可读性，并补齐工具搜索框的返回操作。

## 界面与交互

- 设置页采用 shadcn/ui base-nova 与 Base UI，统一下拉框、开关、按钮和输入框，适配浅色与深色主题。
- 修复下拉框与输入框高度不一致；下拉菜单支持键盘选择、Escape 关闭和 Tab 移焦，并避免被滚动容器裁切。
- 超级面板设置、功能管理、本地启动项与更新设置使用统一控件。
- 调整启动页文字、图标和间距，提升网格、列表及底部操作的可读性。
- 工具顶部搜索框为空时，按 Backspace 返回首页；输入框中有内容时仍正常删除文字。

## 下载与安装

- Windows x64：安装版 Nexlet-0.2.20-Windows-x64-Setup.exe，便携版 Nexlet-0.2.20-Windows-x64.exe。
- Apple Silicon Mac：Nexlet-0.2.20-macOS-arm64.dmg。
- Intel Mac：Nexlet-0.2.20-macOS-x64.dmg。
- Linux x64：Nexlet-0.2.20-Linux-x86_64.AppImage、Nexlet-0.2.20-Linux-amd64.deb。
- Linux arm64：Nexlet-0.2.20-Linux-arm64.AppImage、Nexlet-0.2.20-Linux-arm64.deb。
- macOS ZIP、blockmap 与 latest*.yml 用于应用内更新；SHA256SUMS.txt 提供文件校验值。

手动安装前请完整退出旧版。现有本地数据继续使用原用户目录。

Windows 尚无代码签名；macOS 使用固定签名身份，但尚无 Apple Developer ID 签名与公证。Linux 桌面集成以 X11 为主要验证环境，Wayland 的兼容限制见仓库 docs/linux.md。
