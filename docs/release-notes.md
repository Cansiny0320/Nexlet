Nexlet 0.2.47 新增共享 AI 模型、GitHub 登录与可选同步，并完善截图编辑和插件市场安装流程。

## 新增与改进

- 在设置中统一管理 AI 服务商和默认模型，支持 OpenAI Chat Completions、Responses 与 Anthropic Messages；翻译和 AI 动作插件可以共用模型。
- GitHub 登录后可按类别开启设置、快捷指令、便签等数据同步；提供设备管理、冲突处理和账号删除。每个账号提供 100 MiB 同步空间，API 密钥与登录凭据不参与同步，文件类剪贴板只同步文件名。
- OCR 与翻译支持可选择的能力提供商，剪贴板 OCR 可复用本地 OCR 插件。
- 截图增加矩形、箭头、文字、高亮、实色遮挡、撤销重做与手动长截图拼接。
- 插件市场增加详情、版本日志、排序和下载任务；首次安装及权限增加时确认权限，同权限自动更新保持静默。
- 配套发布 PDF 工具、图片批处理和批量重命名插件；支持 PDF 页面操作与转图、图片缩放/水印/拼图，以及重命名预览、冲突检查和撤销。插件在市场单独安装。

## 修复

- 翻译工作区根据剩余空间分配高度，避免默认窗口出现多余纵向滚动。
- 语言选择器继续显示各语言自称，切换语言不改变工具草稿。

- 修复跨平台文件条目的目录信息过滤，Windows、UNC 和 Unix 路径均只保留文件名。

## English

Nexlet 0.2.47 adds shared AI providers and default models for Chat Completions, Responses and Anthropic Messages, GitHub sign-in with optional category-based sync, configurable OCR and translation providers, screenshot annotations and manual stitching, and a plugin marketplace with download tasks and permission confirmation. Companion plugins add PDF tools, batch image processing and safe batch renaming. Translation layout now uses the available height, and language choices retain their native names.

## 下载

- Windows x64：安装版 Nexlet-0.2.47-Windows-x64-Setup.exe；便携版 Nexlet-0.2.47-Windows-x64.exe。
- Apple Silicon Mac：Nexlet-0.2.47-macOS-arm64.dmg。
- Intel Mac：Nexlet-0.2.47-macOS-x64.dmg。
- Linux x64：Nexlet-0.2.47-Linux-x86_64.AppImage；Nexlet-0.2.47-Linux-amd64.deb。
- Linux arm64：Nexlet-0.2.47-Linux-arm64.AppImage；Nexlet-0.2.47-Linux-arm64.deb。
- macOS ZIP、blockmap 与 latest*.yml 用于应用内更新；SHA256SUMS.txt 提供文件校验值。

手动安装前请先完全退出旧版。现有本地数据继续使用原用户目录。云同步默认关闭，需登录并主动选择同步类别。

Windows 仍无代码签名；macOS 使用固定签名身份，但未经 Apple Developer ID 签名与公证。Linux 桌面集成以 X11 为主要验证环境，Wayland 的已知限制见仓库 docs/linux.md；Linux 不支持重复捕获式手动长截图。
