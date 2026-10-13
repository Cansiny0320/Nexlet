# Linux 使用说明

当前开发版新增 Linux x64 和 arm64 支持；发行资产需等对应版本正式发布。Debian/Ubuntu 可使用 deb，其他桌面发行版优先使用 AppImage。当前验证环境与未验证项见本文末尾。

x64 架构的 AppImage 文件名使用 `x86_64`，deb 使用 `amd64`；ARM 两种包均使用 `arm64`。

## 安装和依赖

- deb：使用 `sudo apt install ./Nexlet-<版本>-Linux-<架构>.deb`，由包管理器安装 GTK、NSS、GIO 等依赖，并推荐安装 `xdotool` 和 `fonts-noto-cjk`。
- AppImage：放在固定目录，执行 `chmod +x Nexlet-<版本>-Linux-<架构>.AppImage` 后运行。需要图形桌面、GTK 3、NSS、GIO（Debian/Ubuntu 的 `libglib2.0-bin`）；自动回贴另需 `xdotool`。精简系统请安装中文字体，例如 `fonts-noto-cjk`，避免界面文字显示方框。若系统没有 FUSE 2，可使用 `APPIMAGE_EXTRACT_AND_RUN=1 ./Nexlet-<版本>-Linux-<架构>.AppImage`。
- 以普通用户运行 Nexlet，生产运行保留 Chromium sandbox。自动化 smoke 使用 Playwright 的测试启动参数，不能替代各发行版上的 sandbox 验收。

## X11 与 Wayland

| 能力 | X11 | Wayland |
| --- | --- | --- |
| 应用搜索、工具、目录文件搜索 | 支持 | 支持，真实桌面待验收 |
| 文本、图片、文件复制 | 支持 | 受桌面剪贴板权限限制 |
| 后台剪贴板历史 | 支持 | 不承诺全局持续读取，取决于合成器权限 |
| 全局快捷键 | 支持；冲突时可改 Ctrl+Alt+Space | 依赖 GlobalShortcuts portal 与桌面授权 |
| 自动回贴 | 需要 xdotool；回贴前核对窗口与进程 | 首版使用复制后手动粘贴 |
| 托盘 | 依赖桌面托盘支持 | 同左，GNOME 可能需要托盘扩展 |

Linux 桌面身份使用 `app.nexlet.desktop.desktop`，与安装包中的入口文件一致。Wayland portal 需要系统能够解析该 desktop 文件；未集成到桌面菜单的 AppImage 不保证快捷键注册成功。可先使用 deb 安装。应用无法强制 Wayland 桌面把窗口置于前台或移动到光标所在屏幕。

## 应用与文件搜索

应用从 XDG 用户/系统 applications 目录读取，包含常见 Flatpak 导出目录；额外目录可在设置中添加。用户项优先覆盖系统项，隐藏/不展示/不属于当前桌面的条目不会出现。启动交给 `gio launch` 处理 desktop Exec 字段，Nexlet 不自行执行 shell 字符串。

文件搜索仅遍历用户添加的目录，按文件名匹配；支持多关键词、双引号短语、通配符、扩展名过滤。跳过隐藏项和符号链接，最多 200 条，设有 5 秒遍历预算、10 万项和 64 层深度限制；慢文件系统的一次系统 I/O 仍可能延长实际耗时。无法读取的目录会跳过并提示，不会将部分结果描述为完整扫描。结果支持打开、定位、复制路径和已有文件夹浏览功能。

文件剪贴板同时写入 `text/uri-list` 与 `x-special/gnome-copied-files`；重放历史统一采用复制，不重新执行剪切。只接受本地文件 URL。

## 自启动与更新

用户开启开机自启动时，在 `$XDG_CONFIG_HOME/autostart`（默认 `~/.config/autostart`）保存 Nexlet 自己的 desktop 文件，关闭时仅删除该文件。状态从文件回读；AppImage 使用 `APPIMAGE` 提供的原始路径，移动文件后重新开启自启动。

AppImage 使用 electron-updater 下载同架构更新，下载/重启由用户选择；路径必须可写。deb 检查正式 Release 后提供同架构 deb 下载入口，由用户使用包管理器升级。x64 使用 `latest-linux.yml`，arm64 使用 `latest-linux-arm64.yml`，发布流程分别校验版本、文件大小和 SHA-512。

## 构建

在 Linux 上执行 `npm ci && npm run package:linux` 可生成两种架构；单架构使用 `npm run package:linux -- --arch arm64`（或 `x64`）。打包脚本按 lockfile 校验并补齐目标架构的 koffi 原生依赖，再检查 ELF 架构，避免跨架构构建产生无法启动的包。构建 deb 需要 `fpm`；原生 ARM 环境可安装 Ruby 后 `gem install fpm` 并设置 `USE_SYSTEM_FPM=true`。

## 验证

CI 配置包含 Ubuntu 24.04 x64/arm64 原生构建，使用 Xvfb + Openbox 运行打包后 smoke。真实 GNOME/KDE Wayland、跨版本 AppImage 更新安装仍须另行验收。仅本地构建与测试不代表远端 CI 或发行版已发布。

本次实际构建、校验值与验收边界见 [2026-10-13 验证记录](validation/linux-support-2026-10-13.md)。
