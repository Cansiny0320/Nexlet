Nexlet 0.2.25 优化唤起、搜索与剪贴板历史的响应速度，并修复计算稿纸与系统确认弹窗的交互。

## 性能与交互

- macOS 唤起优先通过原生接口记录前台应用，减少等待；失败时保留原有回退路径。
- 搜索先显示普通结果和内置匹配，再补充插件正则结果与图标；减少重复配置读取和 Worker 创建，旧查询的延迟结果不会覆盖新查询。
- 剪贴板历史按页读取摘要，只渲染可见记录；展开时加载全文，保留全文搜索、完整复制、跨页多选、收藏、中转和独立窗口恢复。
- 浏览历史时新增记录保持当前可见位置；图片展开、收起后重新计算行高。
- 输入计算公式时优先选择计算稿纸，打开后带入原公式；调整系统操作确认弹窗的按钮顺序。

同一台 Apple M3 Pro、固定合成数据、5 轮交替测试中：唤起流程中位数 67.5 → 4.0 ms，输入到搜索界面结果（含防抖）110.6 → 74.3 ms，500 条长文本历史打开 207.1 → 56.1 ms。结果依赖硬件与数据规模，不代表所有场景；启动和滚动帧间隔未显示稳定改善。完整口径见仓库 `docs/validation/interaction-performance-2026-10-16.md`。

## English

Improves macOS wake-up, shows search results before plugin regex matches and icons finish loading, and pages clipboard summaries with virtual scrolling. Full-text search, complete copying, multi-selection, favorites and detached-window restoration are preserved. Also prioritizes the scratchpad for formulas and carries the original expression into it.

## 下载

- Windows x64：安装版 Nexlet-0.2.25-Windows-x64-Setup.exe；便携版 Nexlet-0.2.25-Windows-x64.exe。
- Apple Silicon Mac：Nexlet-0.2.25-macOS-arm64.dmg。
- Intel Mac：Nexlet-0.2.25-macOS-x64.dmg。
- Linux x64：Nexlet-0.2.25-Linux-x86_64.AppImage、Nexlet-0.2.25-Linux-amd64.deb。
- Linux arm64：Nexlet-0.2.25-Linux-arm64.AppImage、Nexlet-0.2.25-Linux-arm64.deb。
- macOS ZIP、blockmap 与 latest*.yml 用于应用内更新；SHA256SUMS.txt 提供文件校验值。

手动安装前建议完整退出旧版。现有本地数据继续使用原用户目录。

Windows 尚无代码签名。macOS 使用固定签名身份，但未经 Apple Developer ID 签名与公证。Linux 桌面集成以 X11 为主要验证环境，Wayland 的已知限制见仓库 docs/linux.md。
