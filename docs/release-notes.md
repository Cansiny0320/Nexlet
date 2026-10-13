Nexlet 0.2.12 支持已安装的市场插件在重新打开时自动更新。

## 插件自动更新

- 打开市场安装的插件时，先检查并安装兼容新版，再进入插件，无需手动打开市场或确认。
- 更新保留插件配置、持久密钥和本次启动输入。
- 检查最多 2 秒，下载最多 10 秒；断网、超时、坏包或不兼容时继续打开旧版。
- 已运行的插件（含分离窗口）保持当前会话，关闭后下次打开再更新；重复打开合并更新。
- 本地导入和开发目录不自动覆盖；检查期间退出、停用或卸载会取消待启动操作。

## 下载与更新

- Windows x64 安装版：`Nexlet-0.2.12-Windows-x64-Setup.exe`。
- Windows x64 便携版：`Nexlet-0.2.12-Windows-x64.exe`。
- Intel Mac：`Nexlet-0.2.12-macOS-x64.dmg`。
- Apple Silicon Mac：`Nexlet-0.2.12-macOS-arm64.dmg`。
- macOS ZIP、blockmap 和 `latest*.yml` 用于应用内更新；`SHA256SUMS.txt` 提供下载校验值。

手动安装前请从托盘退出旧版，已有本地数据沿用原数据目录。Windows 便携 EXE 请放在固定位置。

Windows 包没有数字签名；macOS 包沿用固定签名身份，但没有 Apple Developer ID 签名或公证。
