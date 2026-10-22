Nexlet 0.2.42 新增 12 项效率功能，让文本、图片、文件和工具结果可以接着处理，并保留上次的工作状态。

## 新增

- 快捷短语：分组管理常用文本，支持日期、剪贴板和输入变量，预览后复制、回贴或继续处理。
- 结果继续处理：文本、HTML、图片和文件可以直接交给下一工具，返回原工具仍保留输入和结果。
- 配置文件：导出可编辑的 JSONC 配置，导入前查看差异、选择类别，支持撤销上一次导入。
- 工作区：按顺序打开应用、目录、编辑器、终端和网页，支持单项运行、取消和只重试失败项。
- 图片文字搜索：通过离线 OCR 识别剪贴板历史图片，支持手动识别、导入图片和收藏后自动识别。
- AI 动作插件：提供报错解释、文字润色、提取待办和生成 commit message，支持自定义提示词、流式输出与取消。
- 工具状态保留：切换时保留输入、结果、选项和滚动位置，可选择跨重启恢复，也可随时清空草稿。
- 富文本剪贴板历史：保留 HTML 格式，也可单独复制纯文本；历史表格可交给图文转图片插件。
- 统一动作菜单：在启动器、剪贴板、文件和工具结果中使用 `Cmd/Ctrl+K`，支持键盘导航和焦点恢复。
- 搜索优化：支持轻量英文拼写容错、拼音高亮和本地查询偏好，精确匹配仍优先。
- 录制控制：支持暂停 15 分钟、排除前台应用和按时间范围清理，默认保护收藏内容。
- 文件预览：选中文件即可预览图片或 UTF-8 文本，用方向键切换；预览不会执行脚本或 HTML。

## 优化

- 将剪贴板数据库读写、搜索和图片处理移出主线程，减少处理大量历史或大图时的界面阻塞。
- 已安装插件先打开，更新在后台准备；减少重复检查、状态刷新和快捷键注册。
- Linux 文件搜索复用未变化的目录内容，macOS 减少空闲时的原生事件轮询。

先更新 Nexlet，再从插件市场更新翻译、离线 OCR、图文转图片，或安装 AI 动作。新插件能力要求 Nexlet 0.2.42；AI 请求仅在主动运行时发送，API Key 不进入配置导出。

使用说明：[12 项效率功能](https://github.com/Cansiny0320/Nexlet/blob/v0.2.42/docs/productivity.md)。

## English

Nexlet 0.2.42 adds snippets with variables, direct result handoff, JSONC configuration import/export with preview and undo, workspace launch sequences, searchable image text through offline OCR, customizable AI actions, tool drafts with optional restart restoration, rich clipboard history, keyboard action menus, typo-tolerant search with local preferences, recording controls, and bounded file previews.

Clipboard database and image work now run away from the main thread. Installed plugins open before background updates finish, and unchanged directories and application state avoid repeated work. Update Nexlet first, then update the companion plugins in the marketplace. AI actions send requests only when explicitly run; API keys are excluded from configuration exports.

## 下载

- Windows x64：安装包 Nexlet-0.2.42-Windows-x64-Setup.exe；便携包 Nexlet-0.2.42-Windows-x64.exe。
- Apple Silicon Mac：Nexlet-0.2.42-macOS-arm64.dmg。
- Intel Mac：Nexlet-0.2.42-macOS-x64.dmg。
- Linux x64：Nexlet-0.2.42-Linux-x86_64.AppImage、Nexlet-0.2.42-Linux-amd64.deb。
- Linux arm64：Nexlet-0.2.42-Linux-arm64.AppImage、Nexlet-0.2.42-Linux-arm64.deb。
- macOS ZIP、blockmap 和 latest*.yml 用于应用内更新；SHA256SUMS.txt 提供文件校验值。

手动安装前请先完全退出旧版。现有本地数据继续使用原用户目录。

Windows 暂无代码签名；macOS 使用固定签名身份，但未经 Apple Developer ID 签名与公证。Linux 桌面集成以 X11 为主要验证环境，Wayland 的已知限制见仓库 docs/linux.md。
