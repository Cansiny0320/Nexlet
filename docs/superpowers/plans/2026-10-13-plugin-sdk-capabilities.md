# Nexlet SDK 能力扩展实施计划

依据：`../specs/2026-10-13-plugin-sdk-capabilities.md`。用户已批准，在当前 checkout 持续实现和验证，无需再次确认执行方式。

## 当前基线

- TS 构建、类型包、示例模板已在 Nexlet-plugins 实现并验证；尚未提交。
- 宿主插件桥接主要在 `src/main/plugins.ts`、`src/main/plugin-runtime.ts`、`src/preload/plugin.ts`。
- 主仓存在大量其他任务的改动。新增能力优先放 `src/main/plugin-sdk/`，公共合同放 `src/shared/plugin-api.ts`，仅对现有入口做必要接入。
- 运行 Node.js 24：`PATH=/Users/bytedance/.nvm/versions/node/v24.19.0/bin:$PATH`。命令生成 dist、测试产物或安装依赖均为本地副作用；真实宿主测试使用临时 userData。

## 1. API 合同、权限和任务归属

文件：`src/shared/plugin-api.ts`、`src/shared/plugin-validation.ts`、`src/shared/types.ts`、`src/preload/plugin.ts`、`src/main/plugin-sdk/index.ts`、`src/main/plugin-sdk/tasks.ts`、相关单元测试。

扩展 manifest/permission，集中注册 API 路由、事件和任务清理；保持原有方法。测试未知方法、未授权请求、跨会话取消、重复任务、超时和关闭后结果丢弃。公共类型在后续各步同步实际实现，不先声明空能力。

## 2. 数据与独立 backend

文件：`src/main/plugin-sdk/database.ts`、`backend.ts`、backend worker、`scheduler.ts`、构建脚本与插件包校验。

增加插件隔离的文档/附件存储、修订冲突、批量查询与 KV 删除；实现 utilityProcess 承载的插件 Node 模块、RPC、进度和取消；持久调度通过后台模块执行。测试重启数据、冲突、附件、任务触发、停用/卸载、backend 崩溃/取消及路径越界。前端关闭不应破坏已声明的后台能力。

## 3. 系统、窗口、指令、屏幕与输入

文件：`src/main/plugin-sdk/system.ts`、`windows.ts`、`input.ts`、`commands.ts`、必要的 runtime/index/renderer 接入。

复用 Platform、Electron 原生模块及现有宿主指令通道，实现文件/进程、窗口/通知/对话框、剪贴板/输入模拟/拖拽、显示器/截图/取色、动态功能和输入框交互。测试文件临时目录、隔离句柄、UI 事件及平台适配；系统授权不足要明确报告，不能返回假成功。

## 4. 浏览器与媒体

文件：`src/main/plugin-sdk/browser.ts`、`media.ts`、媒体 worker、必要运行依赖/构建配置。

建立独立 browser session，提供页面操作、读取、下载、截图/PDF/cookie；实现 Sharp 处理与 FFmpeg 执行/进度/取消。对本地 HTTP fixture、生成图片、短音视频进行真实验证；禁止远程页面获取插件 bridge。验证窗口/任务清理和缺失依赖错误。

## 5. AI、工具、MCP 与服务适配

文件：`src/main/plugin-sdk/providers.ts`、`ai.ts`、`tools.ts`、`mcp.ts`、`services.ts`。

使用配置 provider 和已有加密凭据，提供模型调用/流式输出/取消/工具调用，以及账号、checkout/授权、同步的实际 HTTP 适配。MCP 仅显式启动本地监听，验证调用方与工具归属。以本地 provider fixture 覆盖成功、鉴权失败、畸形返回、超时、断流、取消、冲突；不得产生真实支付或外部配置写入。

## 6. 类型、样例、文档和集成验收

文件：宿主 `docs/plugin-sdk.md`、能力矩阵/验证记录、SDK 导出脚本、插件仓 `sdk/`、构建脚本、backend 模板和类型测试；宿主 `tests/plugin-sdk*.test.ts`、`tests/plugin-sdk*.spec.ts`。

同步公开合同和实际权限，提供每组能力的运行示例。能力表记录实现/已验证/平台或服务依赖，而不是笼统写全部兼容。验证旧 TS 模板及既有插件功能、类型契约和清理行为。

## 验证命令与通过条件

- 宿主 `npm run typecheck`、目标 Vitest 测试、`npm run build`、目标 Playwright SDK 测试。
- 插件仓 `npm test`、`npm run typecheck`、`npm run package`、TS/backend 示例真实宿主测试。
- 两仓仅对本次改动执行 `git diff --check`；必要时运行完整宿主测试并将无关 baseline 错误分开记录。
- 真实运行在临时 userData、临时目录、临时 provider 上完成；断开/取消后无资源泄漏。旧插件无需升级 manifest 才能继续运行。

## 风险与回滚

权限扩展和 Node backend 属于受信任本地能力，文档与安装展示必须准确。同步/支付/provider 不包含实际后端部署。跨平台原生输入和媒体依赖需注明实际验证平台。

不覆盖其他 dirty changes。回滚仅移除本次 SDK 新文件、路由/manifest/构建接入及本次依赖；保留原插件数据，新增数据库表不主动删除。所有 Git 收尾和正式发布等待对应用户授权。

## 执行状态

- [x] API 合同、权限与任务归属
- [x] 数据库、backend 与调度
- [x] 系统、窗口、指令、屏幕与输入
- [x] 浏览器与媒体
- [x] AI、MCP、服务适配
- [x] 类型、样例、文档和集成验证

验证记录：`../../validation/plugin-sdk-2026-10-13.md`。平台和真实服务未运行项按记录明确保留；没有发布或远端写入。
