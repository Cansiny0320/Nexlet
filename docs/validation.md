# Nexlet 0.1.0 验证记录

验证日期：2026-10-11。环境：Windows 10.0.26300 x64、Node.js 25.2.1、Electron 44.7.0；单显示器工作区 2560 × 1392，缩放 100%。

## 本机已通过

| 检查 | 结果与证据范围 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm test` | 3 个测试文件、43 项测试通过；表达式解析、中文 / 拼音检索、manifest / 路径边界、ZIP 验证和持久化 |
| `npx playwright test` | 7 组桌面集成用例通过；等价运行入口为 `npm run test:e2e`，会先重新构建 |
| 原生回贴专项 | 通过；真实启动 `.lnk` 指向的独立编辑器进程，先核对前台进程 ID，再由系统键盘输入粘贴，读取编辑器文本确认完整收到 `Nexlet 外部回贴验证 128 × 3 = 384` |
| `npm run package:win` | 通过，生成 x64 单文件便携包 |
| `node scripts/smoke-package.mjs` | 解压版实际启动；正常模式下托盘、原生桥接、后台剪贴板捕获和计算结果正常 |
| `node scripts/smoke-portable.mjs` | 单文件便携 EXE 实际启动，界面及原生桥接正常，`128*3 = 384`；测试命令成功退出 |
| `npm audit --omit=dev` | 运行依赖没有已知漏洞报告 |

集成用例覆盖：开始菜单与桌面快捷方式检索；真实 `.lnk` 启动；`128*3 → 384`、Enter 续算 `384+256 → 640`；备注、名称、锁定和重启保存；文本、图片、文件捕获；文件原格式和多文本合并复制；图片复制后读取尺寸；收藏、分类搜索、中转窗口；删除后重新捕获相同内容；JSON 正常 / 非法输入；Base64 中文和错误输入；时间戳 0 / 非法输入；UUID；主题切换；文件拖入和图片粘贴；插件开发目录安装、ZIP 升级、存储保留、启停和卸载；未授权 API、Node.js 访问及网络请求被拒绝。

当前机器上的 `Alt+Space` 已被其他应用占用。打包程序正确显示冲突提示，没有改动其他应用设置；可在 Nexlet 设置中自行改用 `Ctrl+Alt+Space`。

## 产物

- `release/Nexlet-0.1.0-Windows-x64.exe`：102,133,017 字节，约 97.4 MiB。
- SHA-256：`2243160c98ccb9fb32e31bb8e6b75277e3d18dae325ea5b4b9e40352ff0ca2bd`。
- `release/win-unpacked/Nexlet.exe`：解压后的应用入口。
- `release/hello-nexlet.nexlet`：可在插件管理中导入的便笺示例。
- `docs/screenshots`：启动器、搜索、剪贴板、计算稿纸、深色设置、示例插件和打包程序截图。

## 未执行或有限范围

- macOS 已提供应用扫描、文件剪贴板和自动回贴实现及 universal DMG 构建命令；没有执行 Mac 真机验证、构建、签名或公证。
- Windows 包未做数字签名。构建器的 signing 日志不代表签名成功；文件签名状态实查为 `NotSigned`。
- 只在单屏、100% 缩放下实测；其他 DPI、跨屏移动、提权窗口及复杂桌面焦点竞争没有完整覆盖。回贴前会校验目标句柄、进程及焦点，失败时提示手动粘贴。
- Linux 文件剪贴板和自动回贴尚未支持，没有提供 Linux 发行包。
- 完整 `npm audit` 仍报告 8 项 moderate，来自 `electron-builder` 开发依赖链的 `sprintf-js`；运行依赖审计为 0。没有执行强制降级或不相容依赖替换。
- Nexlet 自动测试使用独立 `.tmp` 用户目录。前期对照 uTools 时新增了一份 `Nexlet 功能验证` 测试稿纸，已在对照阶段告知；原有稿纸与配置保留。没有初始化 Git、commit、上传或发布远程资源。

便携启动包装器使用 `smoke-portable.mjs` 连接实际渲染进程验证；解压版使用 Playwright `_electron.launch`。截图保存在 `docs/screenshots`。
