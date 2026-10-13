# SDK 扩展验证记录 · 2026-10-13

## 结论与边界

已实现批准方案中的各能力组，并在本机 macOS 的真实 Electron 宿主、独立 utility process、临时 SQLite/文件目录和本地 HTTP 服务上验证主要路径。前端 TS 模板与 backend TS 模板均已构建、打包并实际导入运行。本记录覆盖本地实现与运行验证，不包含正式应用安装或发布。

这些结果表示 Nexlet API 的能力扩展已实现，不表示 uTools API 名称兼容、原插件可以直接安装，或已完成所有操作系统与外部服务认证。

## 能力矩阵

| 能力 | 实现入口 | 本次实际验证 | 仍需的环境验证 |
| --- | --- | --- | --- |
| 权限、IPC、任务归属 | `plugin-sdk/index.ts`、`tasks.ts`、manager/preload | 沙箱无 Node、未授权剪贴板拒绝、重复任务/跨 owner 取消拒绝、超时、关闭后清理 | 新增权限各操作系统 UI 展示 |
| 文档、KV、附件 | `database.ts` | 插件隔离、创建/更新冲突、原子 bulk 回滚、二进制附件、重开保留、卸载删除、KV 旧行为回归 | 大数据配额压力测试未做 |
| Node backend、调度 | `backend.ts`、worker、`scheduler.ts` | 真实后台 RPC/进度、取消杀进程、后续自动重启、异常退出恢复、前端关闭后调度执行、停用条件、持久状态 | 不承诺 backend 为 OS 沙箱；停机时不运行 |
| 窗口、功能、搜索 | `windows.ts`、`commands.ts`、`PluginSearch.tsx` | 子窗口创建/消息/关闭、动态功能加入宿主搜索、输入框变化、结果选择；已有分离/自动更新用例通过 | 所有窗口样式组合未逐项手测 |
| 系统、文件、进程 | `system.ts`、`process.ts` | 系统信息、临时文件读写、默认拒绝覆盖、字面进程参数/输出/取消 | 系统通知、拖拽、回收站及真实文件剪贴板本次未操作 |
| 屏幕、输入 | `screen.ts`、`input.ts` | 本机屏幕/辅助功能已授权；显示器、鼠标坐标、真实桌面截图、60×40 DIP 拖选、向测试插件输入 `a`、原位鼠标移动成功 | Windows、Linux 实机未测；Wayland 明确报不支持全局输入；取色尚未单独手测 |
| 浏览器 | `browser.ts` | 本地 HTTP 导航、远程页面没有 Nexlet/Node、输入/click、上传文件 input、cookie、PNG、PDF、下载、等待超时关闭、旧句柄失效 | 外部真实网站、认证代理未测 |
| 图像、音视频 | `media.ts`、image worker | Sharp 红色 PNG 10×8→5×4，真实 FFmpeg 生成 0.1 秒 WAV | 其他编码器、目标平台安装包和 universal binary 未测 |
| AI/provider | `providers.ts`、`ai.ts` | 配置/凭据隔离、URL 变更清 key、真实本地 models/chat/SSE、取消、Unicode 字节边界、分片工具参数、截断/畸形/HTTP 错误 | 没有调用真实付费模型 |
| 工具与 MCP | `tools.ts`、`mcp.ts` | Schema 拒绝无效参数、真实后台工具、本机 HTTP MCP initialize/tool call、token/Origin 校验、会话结束关闭监听 | 尚未连接外部 MCP 客户端 |
| 账号、checkout、同步 | `services.ts` | 本地 fixture account、登录 URL 与 token 保存、license、checkout URL、带 expectedVersion 的同步与 HTTP 409 冲突 | 没有部署服务、登录真实账号、创建真实订单或执行支付；合同见扩展文档 |
| 类型与打包 | `sdk/`、同步脚本、插件仓 build/package/templates | 公共类型推断/负例、前端禁止 Node 导入、backend 编译 CommonJS、输出排除源码/依赖、旧插件包构建 | 类型包未发布到 npm；模板以仓库源码提供 |

## 命令结果

本机执行 Node.js 24.19.0；宿主 Electron 44.7.0。所有运行态测试使用独立临时 userData，退出后清理。

宿主：

```sh
npm run typecheck
npm test
npm run build
npx playwright test tests/plugin-sdk.spec.ts
npx playwright test tests/plugin-auto-update.spec.ts
# 交互式桌面专项（系统当前可提供屏幕来源时）
NEXLET_SDK_NATIVE=1 npx playwright test tests/plugin-sdk.spec.ts
git diff --check
```

- `typecheck` 通过。过程中并行 OCR 测试文件曾有环境变量类型错误，该文件未由本任务修改；最终全量检查已通过。
- Vitest **56 个文件 / 426 项测试通过**，包括本次 12 项基础、provider、MCP 和进程单元测试。
- SDK Electron 集成测试通过，覆盖上表主要真实运行链路。
- 既有自动更新 Electron 测试 **9 项通过**，覆盖失败保留旧版、分离会话、取消、停用与卸载。
- build 与 diff whitespace 检查通过。

插件仓：

```sh
npm test
npm run typecheck
npm run package
npm run package:example
npm run package:backend
node tests/typescript.e2e.mjs
node tests/backend.e2e.mjs
git diff --check
```

- **16 项 Node 测试通过**；前端/后台分别 typecheck 通过。
- 3 个现有插件及 2 个模板成功构建和打包。
- 前端模板：安装、输入、保存、重开、复制桥接、再激活、沙箱和权限拒绝通过。
- backend 模板：实际安装、后台 SHA-256、文档保存、重开读取通过。

## 本次修复的运行态问题

真实拖选测试发现将全尺寸屏幕图片放进 `data:` 页面 URL 会触发 Chromium `ERR_INVALID_URL`。改为先加载小 HTML 页面，再通过宿主向该受控页面设置背景图，真实拖选测试随后通过。

后续重复桌面专项时出现系统可用性变化：macOS 权限仍为 `granted`、辅助功能为 true，但直接调用 Electron `desktopCapturer.getSources({types:['screen']})` 返回空数组，混合枚举仅有 window 来源。该失败也发生在 SDK 之外，未伪装为通过。此前的真实截图/拖选/输入成功仍有记录；当前屏幕来源不可用时 `screen.capture/select` 会明确报错。桌面专项保留 `NEXLET_SDK_NATIVE=1` 显式开关，常规集成用例不依赖正在使用的桌面。未尝试修改系统授权或其他应用状态。

## 改动归属与回滚

主仓同时存在 selection/super-panel、窗口/OCR 等其他工作，全部保留，不能整仓 reset。SDK 独立代码位于 `src/main/plugin-sdk/`、`src/preload/plugin-sdk.ts`、`src/shared/plugin-api.ts`、`sdk/`；共享入口只有权限/生命周期/窗口/搜索接入。新增依赖为 `ajv`、`sharp`、`ffmpeg-static`，打包解包路径为本次新增媒体依赖；`tesseract.js` 与 OCR worker 属于并行工作。

回滚只移除 SDK 新代码与接入、对应依赖及模板，不回退其他 dirty changes，不主动删除用户数据库表或插件数据。尚未运行正式签名/跨平台打包，因此不将本地 build 通过写成正式安装包验收。

## 推送前的独立快照验证

为避免依赖并行未提交内容，从 `HEAD` 加上本次 SDK/类型/模板改动导出独立源码快照，不包含 Ctool、OCR、超级面板或命令管理改动。该快照通过宿主 typecheck、build、6 个相关测试文件共 31 项单测、SDK 与自动更新共 10 项 Electron 测试；插件仓通过 16 项测试、前后端类型检查、3 个插件及 2 个模板打包，以及两个模板的真实安装运行测试。依赖复用本机已安装版本，lockfile 与 package.json 根依赖一致。上述 426 项全量测试是在包含并行改动的工作区执行，不能与本次独立快照测试数量混用。
