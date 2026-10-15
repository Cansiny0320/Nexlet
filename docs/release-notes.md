Nexlet 0.2.23 新增简体中文、繁体中文与 English 界面，并同步官网、文档和自有插件。

## 语言与交互

- 默认跟随系统，可在设置中选择语言并持久保存；主窗口、独立工具、超级面板、托盘和插件同步更新。
- 切换语言保留输入、JSON 编辑器状态和插件会话；搜索继续支持中英文、繁体和拼音别名。
- 本地化系统提示、日期与数字展示；保留用户内容、命令 ID 和协议值。
- 插件 SDK 新增应用语言读取和变化通知，以及可选的本地化显示字段；旧插件保持兼容。
- 便笺、字数统计和翻译插件提供三语版本。Ctool 跟随上游中英文，繁体回退简体；插件通过插件市场独立更新。
- README 默认中文，公开 SDK、Linux 和插件文档提供英文、繁体版本。官网新增 /en/ 和 /zh-Hant/ 路径。
- 包含此前已合入的更新交互修复：点击重启更新后直接进入已选择的安装流程。

## English

Adds Simplified Chinese, Traditional Chinese and English across the desktop UI, website, public documentation and owned plugins. Language changes preserve input and plugin sessions. Ctool uses upstream English or Simplified Chinese, with Traditional Chinese falling back to Simplified Chinese. Existing plugins remain compatible.

## 下载

- Windows x64：安装版 Nexlet-0.2.23-Windows-x64-Setup.exe；便携版 Nexlet-0.2.23-Windows-x64.exe。
- Apple Silicon Mac：Nexlet-0.2.23-macOS-arm64.dmg。
- Intel Mac：Nexlet-0.2.23-macOS-x64.dmg。
- Linux x64：Nexlet-0.2.23-Linux-x86_64.AppImage、Nexlet-0.2.23-Linux-amd64.deb。
- Linux arm64：Nexlet-0.2.23-Linux-arm64.AppImage、Nexlet-0.2.23-Linux-arm64.deb。
- macOS ZIP、blockmap 与 latest*.yml 用于应用内更新；SHA256SUMS.txt 提供文件校验值。

手动安装前建议完整退出旧版。现有本地数据继续使用原用户目录。

Windows 尚无代码签名。macOS 使用固定签名身份，但未经 Apple Developer ID 签名与公证。Linux 桌面集成以 X11 为主要验证环境，Wayland 的已知限制见仓库 docs/linux.md。
