Nexlet 0.2.11 修复插件顶部标签缺少图标，并简化插件安装、更新和联网交互。

## 插件体验

- 插件顶部标签展示插件声明的图标，未提供图标时使用默认插件图标。
- 点击安装或更新后直接执行，不再弹出安装权限确认。
- 已安装插件声明 `network.request` 后可直接发起请求，不再逐地址弹窗确认。
- 保留插件沙箱、manifest 能力检查、请求取消、超时与响应大小限制；更新保留插件独立数据。

## 翻译插件

翻译插件另行通过插件市场更新至 1.1.0：保留现有 UI，Google 在停止输入 400 毫秒后自动翻译，支持粘贴、启动器带入文字和切换语言；中文输入法组词期间不发送请求，旧结果不会覆盖新输入。LLM 保留手动翻译。

## 下载与更新

- Windows x64 安装版：`Nexlet-0.2.11-Windows-x64-Setup.exe`。
- Windows x64 便携版：`Nexlet-0.2.11-Windows-x64.exe`。
- Intel Mac：`Nexlet-0.2.11-macOS-x64.dmg`。
- Apple Silicon Mac：`Nexlet-0.2.11-macOS-arm64.dmg`。
- macOS ZIP、blockmap 和 `latest*.yml` 用于应用内更新；`SHA256SUMS.txt` 提供下载校验值。

手动安装前请从托盘退出旧版，已有本地数据沿用原数据目录。Windows 便携 EXE 请放在固定位置。

Windows 包没有数字签名；macOS 包沿用固定签名身份，但没有 Apple Developer ID 签名或公证。
