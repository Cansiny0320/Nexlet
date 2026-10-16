Nexlet 0.2.31 优化 Windows 应用列表：过滤附属快捷方式，启动时先显示缓存的应用和图标，再后台更新。

## Windows 应用列表

- 过滤卸载入口、帮助文档和更新日志，保留正常应用、终端、系统管理工具和开发工具。
- 结合快捷方式名称、目标文件和启动参数识别附属入口，保留原有去重规则及固定、最近使用记录的映射。

## 启动与图标缓存

- 应用目录和已加载的图标保存到本地缓存。重新启动后先恢复列表与图标，再在后台扫描变化；首次启动或缓存失效时正常扫描。
- 后台检查快捷方式、目标程序和图标资源的变化，复用未变化的图标，更新新增或变化的条目，并移除已删除的入口。
- 扫描失败时保留可用缓存；迟到的图标响应不会覆盖更新后的结果。缓存损坏时自动重建，不影响设置、剪贴板和固定记录。
- 缓存使用独立数据库并限制容量。本次持久缓存适用于 Windows。

## English

Windows now restores cached applications, shortcuts and previously loaded icons at startup, then refreshes the catalog in the background. Changed icon resources are refreshed, deleted entries are removed, and scan failures retain the last usable snapshot. The bounded cache is stored separately from user data and can be rebuilt after corruption.

Uninstall entries, help documents and release notes are filtered from the Windows catalog while normal applications, system tools and developer tools remain available. Shortcut deduplication and saved pin/recent mappings are preserved.

## 下载

- Windows x64：安装版 Nexlet-0.2.31-Windows-x64-Setup.exe；便携版 Nexlet-0.2.31-Windows-x64.exe。
- Apple Silicon Mac：Nexlet-0.2.31-macOS-arm64.dmg。
- Intel Mac：Nexlet-0.2.31-macOS-x64.dmg。
- Linux x64：Nexlet-0.2.31-Linux-x86_64.AppImage、Nexlet-0.2.31-Linux-amd64.deb。
- Linux arm64：Nexlet-0.2.31-Linux-arm64.AppImage、Nexlet-0.2.31-Linux-arm64.deb。
- 可选离线 OCR：nexlet-ocr.nexlet，可在 Nexlet 插件页选择「安装插件」导入；需要 Nexlet 0.2.30 或更新版本。
- macOS ZIP、blockmap 和 latest*.yml 用于应用内更新；SHA256SUMS.txt 提供文件校验值。

手动安装前请先完全退出旧版。现有本地数据继续使用原用户目录。

Windows 暂无代码签名；macOS 使用固定签名身份，但未做 Apple Developer ID 签名与公证。Linux 桌面集成以 X11 为主要验证环境，Wayland 的已知限制见仓库 docs/linux.md。
