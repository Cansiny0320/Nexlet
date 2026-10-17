# Nexlet 技术栈对齐

2026-10-18，用户已批准本方案。技术栈依据 Space「技术栈选型」；追加授权更新 Space 中的 TypeScript 版本约定。

## 范围

- 根目录 npm 改为 pnpm；同步安装锁文件、开发命令、CI 和本地打包/基准脚本。
- Vite+ 统一 renderer 构建、Vitest、Oxlint 和 Oxfmt；主进程、preload、worker 使用 Vite+ pack。保持既有 dist 入口路径、CJS 格式和原生依赖外置规则。
- 移除本次会话临时引入的 ESLint、parser、import plugin。Oxlint 启用 import/no-duplicates，保留独立 import type、区分 query string，提供 lint 与 lint:fix。
- Oxfmt 提供 format 与 format:check，统一第一方源码格式，排除生成产物、供应商资产和独立官网。
- 内置界面至宿主的请求使用 oRPC MessagePort 和明确的输入/输出类型。保持来源、frame、窗口权限、输入验证、窗口关闭清理及原有错误信息；既有事件通知和第三方插件 API 保持兼容。
- 官网保留独立 pnpm 锁文件、安装/构建与 Sites 导出能力，不改部署状态。

## 保留

Electron、electron-builder、原生系统库、node:sqlite 及本地数据格式、桌面导航继续使用现有实现。React 19、Tailwind CSS v4、base-nova 已对齐。官网现有 TanStack Start/Router 与 Workers 不迁移。不引入 D1、R2、Better Auth、邮件服务或 Drizzle RC。

## 关键边界

- pnpm 安装布局须被 electron-builder 正确收集；Koffi、Sharp 等原生运行依赖必须出现在实际 ASAR/unpacked 中。
- Linux 跨架构原生依赖继续按锁文件版本和完整性下载/校验，不能退化为不固定版本的安装。
- 主进程继续校验宿主窗口、主 frame 和文档来源；MessagePort 不授予第三方插件宿主权限。renderer 重载或关闭后清理连接，不能留下永久等待的请求。
- 不能只将 unknown 输入和调用方自行指定返回类型包装进 oRPC；请求合同应让调用点由 action 推导参数与结果。
- 迁移使用受支持的 Node 24 运行；保留已存在的并行改动。格式化和语义改动分别检查。

## 验收

冻结锁文件安装可重复；lint、format:check、typecheck、单元测试与构建通过；真实 Electron 测试覆盖启动、查询/写入、权限拒绝、错误传播、窗口与插件生命周期。Windows 安装版/便携版构建后验证 ASAR、preload、worker、原生依赖与 packaged smoke。其他平台用配置/脚本测试验证，未实际运行的平台明确记录。

## 回滚和外部动作

分阶段保存本次改动前的文件快照，仅恢复迁移自身内容，保留并行修改。数据库无迁移，已安装应用和真实用户数据不修改。仅本地安装开发依赖、构建与隔离测试；不 commit、push、创建 PR、发布、部署或安装应用。


## 2026-10-18 追加批准

主项目升级 TypeScript 7.0.2，启用 Vite+ 的 typeAware 和 typeCheck，由 pnpm check 统一执行格式、lint 与类型检查。此次迁移工具采用 npm 最新稳定版：Vite+ 1.3.0、oRPC 1.15.7、pnpm 12.14.0。用户同时授权在 Space「技术栈选型」标注“TypeScript 最新版”。
