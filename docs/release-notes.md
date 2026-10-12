Nexlet 0.2.10 增加应用内文件夹浏览和文件信息预览，更新 Logo 与功能图标，并改进搜索准备和应用启动反馈。

## 文件搜索

- 双击文件夹可直接在 Nexlet 内查看子项，支持面包屑、上一级和返回原搜索。
- 单击文件或文件夹显示完整路径、类型、创建时间和修改时间；文件另显示大小。
- 当前文件夹支持按名称筛选和分批加载，文件类型使用不同图标。双击文件仍由系统默认应用打开。
- 独立窗口恢复保留目录位置和选择；读取失败、文件删除及权限不足会显示错误。
- Windows 打开文件搜索即准备 Everything 索引，显示等待进度；修复引擎运行时重复覆盖文件，以及启动阶段误报不可用的问题。
- macOS 文件搜索接入 Spotlight。

## 其他更新

- 更新应用 Logo 与七个内置功能图标，保留现有界面布局和主题色。
- 工具按需加载，改进 macOS 剪贴板变化检测。
- 修复 Windows 应用启动结果提示、启动器粘贴图片预览、更新说明渲染和下载进度展示。
- 为插件提供受权限控制的网络请求和密钥存储 API。

## 下载与更新

- Windows x64 安装版：`Nexlet-0.2.10-Windows-x64-Setup.exe`。
- Windows x64 便携版：`Nexlet-0.2.10-Windows-x64.exe`。
- Intel Mac：`Nexlet-0.2.10-macOS-x64.dmg`。
- Apple Silicon Mac：`Nexlet-0.2.10-macOS-arm64.dmg`。
- macOS ZIP、blockmap 和 `latest*.yml` 用于应用内更新。`hello-nexlet.nexlet` 为示例插件；`SHA256SUMS.txt` 提供下载校验值。

手动安装前请从托盘退出旧版，已有本地数据沿用原数据目录。Windows 便携 EXE 请放在固定位置；移动文件后如需自启动，请在设置中重新开启。

## 平台说明

- Windows 包没有数字签名。Everything 仅在 Windows 提供，首次索引可能需要较长时间，不安装系统服务。
- macOS 包使用固定签名身份以支持后续更新，但没有 Apple Developer ID 签名或公证；首次打开仍可能需要在系统设置中明确允许。
- macOS 自动回贴需要辅助功能权限。文件夹浏览的交互回归在 Windows 完成；macOS 桌面交互仍需对应平台验证。
