# 选区获取与超级面板

用户于 2026-10-13 批准本设计。本批在已有入口对齐改动上继续实现；保留 Nexlet SDK v1、沙箱及插件输入授权，不兼容 uTools 私有 API。

## 验收行为

- 当前应用选区包括文本、可复制图片、文件和目录。触发时冻结前台窗口、鼠标位置及请求代次，原生文本读取优先，复制兜底；无新选区不得使用旧剪贴板。
- 复制兜底先物化剪贴板格式，暂停 Nexlet 历史捕获，检查前台身份及按键释放，再发送复制；有新版本才读入。仅剪贴板仍为本次读取版本时尝试恢复。外部复制、快照不可读/过大、超时、目标变化则取消对应步骤。跨应用版本检查并非系统级原子 CAS，不保证外部管理器竞态下绝对恢复。
- 面板默认长按右键 200 ms，可调整 200–400 ms，支持中键及自定义快捷键、关闭鼠标触发、按应用排除。短按保持右键；拖动取消长按。长按后悬停释放执行，快速释放保留点击模式；空白释放保留，外部点击/Escape 关闭。
- 面板在鼠标附近独立显示，限制在显示器 workArea 内。鼠标触发先 showInactive，键盘操作时取得焦点；原主窗口内容保持。退出仅在 Nexlet 仍占焦点时尝试回到原窗口。
- 有输入时显示预览与现有内容匹配、网页搜索、JSON、计算、时间戳；可带输入转入主搜索。无输入显示常用入口。实际执行统一经过命令可用性检查，成功才记录最近使用。
- 常用入口独立持久化，默认首次复制主界面固定项。支持添加、拖拽排序、单层文件夹合并/命名/移出、移除和滚轮翻页；禁用/卸载保留配置但不执行。
- 功能快捷键增加 captureSelection 选项，默认关闭；关闭时继续保留已有工具/插件实例及输入。有效新输入是一次显式激活，失败或无选区按普通打开执行。
- 选区只按触发读取且只留在内存，不持久化选区内容。输入增加 from: selection；旧 SDK payload 合同不变，只有实际选择的插件获得资源 token。
- 本批不包含语音、自动翻译、窗口管理、截图 OCR。macOS/Windows 原生支持与实际测试证据分别报告。

## 结构与失败处理

SelectionService 协调请求取消与复制事务；Platform/原生适配器只提供有限的前台身份、选区和按键能力。独立 Koffi worker 处理鼠标消息循环与手势；回调不执行磁盘、剪贴板和 Accessibility 读取。worker 退出/停用卸载钩子，不影响普通快捷键入口。

PanelConfig 使用版本、revision、稳定 command ID；与 CommandConfig 的主页固定列表分开。SuperPanelController 管理面板窗口和输入 owner，委派统一执行入口；关闭面板撤销 owner，已交给插件的授权按原生命周期管理。忙碌/对话框/工具交接/安装期间忽略触发，不排队补执行。

原生权限只在用户点击授权入口时请求；没有权限或被系统阻止时显示可理解状态并允许空面板。Windows 终端复制使用 Ctrl+Insert，不能使用可能中断命令的 Ctrl+C；不自动提权。

## 依据

- uTools 7.8.0 本机 ASAR 的静态分析：dist/main.js setFeatureHotKey、triggerShow、nativeVoicePanelTrigger；dist/voice/index.js holdUp。静态代码不能替代运行验证。
- https://www.u-tools.cn/docs/guide/uTools-super-panel.html
- https://www.electronjs.org/docs/latest/api/clipboard
- https://learn.microsoft.com/en-us/windows/win32/winmsg/lowlevelmouseproc
- https://developer.apple.com/documentation/coregraphics/cgevent/tapcreate(tap:place:options:eventsofinterest:callback:userinfo:)

## 风险与回滚

右键拦截、焦点和剪贴板存在平台差异；以正常右键、终端、外部复制和权限缺失为回归重点。保留应用排除与关闭鼠标触发入口。新配置独立存储；回滚本批文件变更并忽略新配置即可，不能覆盖并行工作。无 commit、push、安装或发布授权。
