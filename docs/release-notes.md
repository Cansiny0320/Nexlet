Nexlet 0.2.30 精简安装包，将离线 OCR 拆为按需安装的独立插件，并修复 Windows 差分更新的打包方式。

## 包体积与更新

- 移除发布包中的 Source map、重复打包的前端依赖及多余语言资源，保留简体中文、繁体中文和 English。
- 移除未使用的 FFmpeg 命令行程序。插件 SDK 的 `media.ffmpeg` 仍可使用显式指定的本机 FFmpeg 路径，需声明相应权限。
- Windows 安装版和便携版分别打包，确保安装版保留适合差分更新的压缩布局。本次改变了压缩方式和大量文件，从旧版升级时增量下载仍可能接近全量；后续下载量取决于实际版本差异及本地缓存。

## 离线 OCR 插件

- 宿主不再内置 OCR。需要此功能时，下载本 Release 的 `nexlet-ocr.nexlet`，在 Nexlet 插件页面选择「安装插件」导入；需要 Nexlet 0.2.30 或更新版本。
- 插件自带模型与运行时，安装后无需联网，支持图片和截图识别、识别后复制、取消、结果编辑及返回搜索。旧 OCR 快捷键、别名和固定偏好会迁移，安装插件后生效。
- 新增受权限控制的本地计算能力，允许插件在隔离环境中运行 WASM 和 Worker；识别期间剪贴板变化时保留结果，避免自动复制覆盖新内容。
- OCR 插件有独立版本号，不会自动安装，也不计入宿主更新包。

## 其他

- 设置页快捷键按当前平台显示，并补充 macOS 首次打开说明。

## English

Reduces package size by excluding source maps, duplicated frontend dependencies, unused languages and the bundled FFmpeg executable. Windows installer and portable builds now use separate packaging paths to preserve differential-update compression. This transition may still require a near-full download.

Offline OCR is now an optional plugin. Download `nexlet-ocr.nexlet` from this release and import it on the Plugins page in Nexlet 0.2.30 or later. Models are included for offline use; recognition, capture, cancellation, editing, copying and returning text to search are preserved. Existing OCR command preferences migrate to the plugin.

## 下载

- Windows x64：安装版 Nexlet-0.2.30-Windows-x64-Setup.exe；便携版 Nexlet-0.2.30-Windows-x64.exe。
- Apple Silicon Mac：Nexlet-0.2.30-macOS-arm64.dmg。
- Intel Mac：Nexlet-0.2.30-macOS-x64.dmg。
- Linux x64：Nexlet-0.2.30-Linux-x86_64.AppImage、Nexlet-0.2.30-Linux-amd64.deb。
- Linux arm64：Nexlet-0.2.30-Linux-arm64.AppImage、Nexlet-0.2.30-Linux-arm64.deb。
- 可选离线 OCR：nexlet-ocr.nexlet。
- macOS ZIP、blockmap 和 latest*.yml 用于应用内更新；SHA256SUMS.txt 提供文件校验值。

手动安装前请先完全退出旧版。现有本地数据继续使用原用户目录。

Windows 暂无代码签名；macOS 使用固定签名身份，但未做 Apple Developer ID 签名与公证。Linux 桌面集成以 X11 为主要验证环境，Wayland 的已知限制见仓库 docs/linux.md。
