Nexlet 0.2.39 支持自动更新应用列表，安装或卸载应用后无需手动重新扫描。

## 应用列表自动更新

- 监听应用和快捷方式目录的变化，自动更新新增、卸载的应用，并合并短时间内的连续变更。
- 唤起 Nexlet 时异步补查漏掉的变化；不等待检查完成再显示窗口，也不在后台定时轮询。
- 目录未变化时保留现有列表和图标缓存，不额外触发搜索结果刷新。Windows 同时检查商店应用注册变化。
- 修复扫描期间发生新的目录变化时，刷新请求可能丢失的问题；支持自定义目录后续创建、删除和重建。

## English

Nexlet 0.2.39 automatically refreshes the application list when apps or shortcuts are installed or removed. Filesystem events trigger updates, while an asynchronous check on wake recovers missed changes without background polling or delaying the launcher. Unchanged catalogs keep their entries and cached icons. Windows also checks registered Store applications. Changes arriving during a scan are retained for a follow-up refresh.

## 下载

- Windows x64：安装包 Nexlet-0.2.39-Windows-x64-Setup.exe；便携包 Nexlet-0.2.39-Windows-x64.exe。
- Apple Silicon Mac：Nexlet-0.2.39-macOS-arm64.dmg。
- Intel Mac：Nexlet-0.2.39-macOS-x64.dmg。
- Linux x64：Nexlet-0.2.39-Linux-x86_64.AppImage、Nexlet-0.2.39-Linux-amd64.deb。
- Linux arm64：Nexlet-0.2.39-Linux-arm64.AppImage、Nexlet-0.2.39-Linux-arm64.deb。
- macOS ZIP、blockmap 和 latest*.yml 用于应用内更新；SHA256SUMS.txt 提供文件校验值。

手动安装前请先完全退出旧版。现有本地数据继续使用原用户目录。

Windows 暂无代码签名；macOS 使用固定签名身份，但未经 Apple Developer ID 签名与公证。Linux 桌面集成以 X11 为主要验证环境，Wayland 的已知限制见仓库 docs/linux.md。
