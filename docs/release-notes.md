Nexlet 0.2.6 修复启动器应用图标显示。

## 修复

- 展开「全部工具」时分批加载应用和快捷方式的真实图标，并复用图标缓存。
- macOS 改用系统应用图标接口，修复 Electron 返回统一通用图标的问题。
- 展开「最近使用」时补齐第 19 项及后续应用的图标。
- 图标读取失败时保留默认占位图，不影响应用展示和启动。

## 下载与更新

- Windows x64 安装版：`Nexlet-0.2.6-Windows-x64-Setup.exe`。
- Windows x64 便携版：`Nexlet-0.2.6-Windows-x64.exe`。
- Intel Mac：`Nexlet-0.2.6-macOS-x64.dmg`。
- Apple Silicon Mac：`Nexlet-0.2.6-macOS-arm64.dmg`。
- macOS ZIP、blockmap 和 `latest*.yml` 用于应用内更新。`hello-nexlet.nexlet` 为示例插件；`SHA256SUMS.txt` 提供下载校验值。

从 0.2.2 升级请手动下载安装包，先从托盘退出旧版。已有本地数据沿用原数据目录。Windows 便携 EXE 请放在固定位置；移动文件后如需自启动，请在设置中重新开启。

## 平台说明

- Windows 包没有数字签名。Everything 仅在 Windows 提供，首次索引可能需要较长时间，不安装系统服务。
- macOS 包使用固定签名身份以支持后续更新，但没有 Apple Developer ID 签名或公证；首次打开仍可能需要在系统设置中明确允许。
- macOS 自动回贴需要辅助功能权限。原生文件剪贴板已在本机实测；不能将其等同于跨应用回贴和系统授权流程的完整验收。
