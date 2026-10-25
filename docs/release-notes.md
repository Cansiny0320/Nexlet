Nexlet 0.2.48 修复插件市场布局，统一新设置页的控件，并改善截图编辑器和设备登录界面。

## 改进与修复

- 插件市场按窗口宽度自动排列卡片，同一行卡片和底部操作对齐；平台等次要信息收进详情，窄窗口的卡片与列表均可使用。
- AI 模型、OCR/翻译、账号同步和配置导入导出改用统一的输入框、选择框、按钮、复选框和折叠区域；保留原有配置及操作。
- AI 编辑器将协议、模型测试和维护操作放进展开区，取消和保存按钮统一靠右。
- 截图编辑器使用带名称提示的图标工具栏，按功能分组；修复窄窗口下工具按钮被裁切的问题。
- 设备登录页更新为品牌面板，明确展示当前 GitHub 账号和设备代码；请求期间锁定代码及按钮，防止重复确认，失败后可重试。
- 配套发布 PDF 工具、图片批处理和批量重命名 1.0.1：采用文件/预览与参数分栏布局、文件操作图标及统一控件，支持窄窗口与深色模式。插件通过插件市场单独更新。

## English

Nexlet 0.2.48 makes marketplace cards responsive and aligns their actions, unifies controls across AI, OCR, sync and configuration settings, and improves the screenshot editor toolbar at narrow widths. The device sign-in page now clearly presents the account and code, prevents duplicate confirmation requests, and supports retries. Companion PDF, image-processing and batch-renaming plugins receive a consistent workbench layout in version 1.0.1.

## 下载

- Windows x64：安装版 Nexlet-0.2.48-Windows-x64-Setup.exe；便携版 Nexlet-0.2.48-Windows-x64.exe。
- Apple Silicon Mac：Nexlet-0.2.48-macOS-arm64.dmg。
- Intel Mac：Nexlet-0.2.48-macOS-x64.dmg。
- Linux x64：Nexlet-0.2.48-Linux-x86_64.AppImage；Nexlet-0.2.48-Linux-amd64.deb。
- Linux arm64：Nexlet-0.2.48-Linux-arm64.AppImage；Nexlet-0.2.48-Linux-arm64.deb。
- macOS ZIP、blockmap 和 latest*.yml 用于应用内更新；SHA256SUMS.txt 提供文件校验值。

手动安装前请完全退出旧版。现有本地数据继续使用原用户目录。云同步默认关闭，需登录后主动选择同步类别。

Windows 尚无代码签名；macOS 使用固定签名身份，但未做 Apple Developer ID 签名与公证。Linux 桌面集成以 X11 为主要验证环境，Wayland 等已知限制见仓库 docs/linux.md。Linux 支持重复截图式手动长图。
