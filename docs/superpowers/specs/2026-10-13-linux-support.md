# Linux support — approved 2026-10-13

用户批准：Linux x64/arm64 AppImage 和 deb；XDG 应用索引/启动/图标；文件剪贴板；X11 自动回贴、Wayland 手动回贴和能力提示；XDG 登录自启动；按指定目录搜索文件名且可取消/限制结果；AppImage 应用内更新、deb 手动升级；Linux CI 与说明。

## 行为边界
- XDG 用户目录优先，Hidden/NoDisplay/OnlyShowIn/NotShowIn/TryExec 生效。启动使用桌面启动器，不把 Exec 拼成 shell 命令。
- X11 回贴依赖 xdotool，恢复并验证目标窗口，缺少依赖或窗口变化时保留已复制内容。Wayland 不承诺全局后台剪贴板采集或自动回贴，快捷键依赖 portal 与桌面授权。
- 仅扫描用户配置的文件搜索目录；不引入后台全盘索引服务。跳过隐藏目录及符号链接，设时间/数量边界，替换请求和关闭窗口取消旧查询。
- 仅用户开启时写自启动项；AppImage 使用原始稳定文件路径而非临时挂载路径。
- 架构隔离更新元数据并校验资产；不改变 Windows/macOS 更新行为。
- 保留已有改动，不提交、推送、发布；容器/Xvfb 不代替真实 GNOME/KDE Wayland 验收。
