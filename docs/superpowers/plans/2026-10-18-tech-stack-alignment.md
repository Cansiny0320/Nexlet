# Nexlet 技术栈对齐实施计划

依据 ../specs/2026-10-18-tech-stack-alignment.md，2026-10-18 用户已批准。

## 1 基线与依赖

- 保存当前相关源码/配置/锁文件到忽略目录 .tmp，记录 Git 状态，保留所有并行改动。
- 检查 Node 24、pnpm、Vite+、oRPC 官方文档和包导出。运行当前 typecheck/test 作为基线；不修复无关失败。
- 修改 package.json、.node-version、pnpm-workspace.yaml，生成 pnpm-lock.yaml 后删除根 package-lock.json；移除 eslint.config.js 和 ESLint 依赖。website 不纳入根 workspace，保持独立锁文件。

## 2 工具链与发布脚本

- 修改 vite.config.ts、vitest.config.ts（合并/替换）、scripts/build.mjs、tests 的 Vitest import、CI workflow。
- 配置 Vite+ build/test/pack/lint/fmt，保留 renderer base、别名、输出目录，主/preload/worker 的 CJS 入口及 external 策略。
- 更新 scripts/package-linux.mjs、scripts/ci-metadata.mjs、基准脚本及活跃三语言开发文档中的锁文件/包管理调用。
- 对 Linux 锁文件完整性解析、原生架构校验添加有意义的测试；保留既有发布 tag/version 校验。
- 验证 pnpm install --frozen-lockfile、pnpm lint、pnpm typecheck、pnpm test、pnpm build；构建写 dist，安装联网且写依赖/锁文件。

## 3 宿主 oRPC

- 新增 shared 宿主合同与 main/renderer 通信模块，调整 src/main/index.ts、src/preload/host.ts、src/shared/types.ts、src/renderer/common.tsx 及内置调用点。
- 明确每项请求输入/输出，替代调用方指定泛型返回值。保留既有业务分发逻辑与输入验证，使用 MessagePort adapter。
- 保留独立事件、文件拖入、语言同步以及第三方插件协议；校验 sender/frame/document、连接生命周期和每个请求的窗口状态。
- 先添加合同类型、消息请求/错误、权限拒绝与窗口销毁/重载回归验证，再替换旧请求路径。现有 Electron 测试继续覆盖外部可观察行为。

## 4 格式化与交付验证

- 执行 pnpm format，检查非格式语义差异及并行改动保留情况。再次运行 lint、format:check、typecheck、test、build；新改动才重复相关验证。
- 运行与 IPC、窗口、剪贴板、设置、文件搜索及插件生命周期有关的 Electron 测试。使用临时 userData，避免真实用户数据。
- Windows 构建安装版/便携版，检查实际 ASAR/unpacked 入口与运行依赖，运行 packaged/portable smoke；只产出本地文件，不安装/发布。
- Git diff --check，更新计划完成情况及验证记录，明确基线失败和未运行的平台。

## 回滚

按阶段使用 .tmp 中原始文件和本次 diff 回退迁移，绝不对 dirty worktree 执行整体 reset/checkout。恢复原 package/lock/config 后重新安装原依赖即可回退工具链；宿主协议仅内部使用，无持久数据迁移。任何新增重大决策或超出范围的动作单独确认。


## 2026-10-18 追加批准

主项目升级 TypeScript 7.0.2，使用 Vite+ 统一类型检查；迁移工具使用已核实的最新稳定版 Vite+ 1.3.0、oRPC 1.15.7、pnpm 12.14.0。更新 Space 技术栈的 TypeScript 最新版约定，并回读确认。

## 实施与验证记录

已完成上述迁移。主项目固定 TypeScript 7.0.2、Vite+ 1.3.0、oRPC 1.15.7、pnpm 12.14.0；网站目录没有改动。内部 45 个 action 使用共享输入/输出合同及 oRPC MessagePort，保留已有业务校验、来源授权、事件通知和第三方插件协议。Oxfmt 已应用到第一方源码。

验证使用 Node 24.19.0 与项目内临时 pnpm 12.14.0，未修改机器全局工具。系统默认 Node 25 不在 Vite+ 支持范围内，开发时应切换到 `.node-version` 指定版本。

- `pnpm install --frozen-lockfile`、`pnpm check`、独立 `pnpm exec tsc --noEmit`、`pnpm build`、`node scripts/ci-metadata.mjs` 通过。
- 最终 `pnpm test`：77 个文件通过、2 个跳过；502 项通过、4 项跳过。包含新增的通信往返、每次请求授权、错误传播、端口关闭、类型合同、锁文件原生依赖和发布版本校验。
- 首批 Electron 测试 21 项通过；其余完整执行 95 项通过、7 项跳过、2 项失败、5 项因串行前置失败未运行。新增的真实 Electron oRPC 通信及连续重载测试通过。
- 窗口恢复焦点用例首次失败，单独重跑通过；迁移前快照同一用例也通过，记录为本次运行的不稳定现象，未改动窗口实现或断言。
- 翻译插件页面高度断言在当前代码和迁移前代码均失败。对照使用迁移前保存的源码、原始 npm 锁文件与工具链，补入遗漏的已跟踪 HTML/CSS 和静态资源。临时诊断副本记录页面高度 543、视口高度 541；原测试断言保留。该副本只将此已知失败断言改为输出尺寸，继续验证网络权限、取消与失效请求、会话密钥、停用/重新打开、安装卸载：7 项通过、1 项真实 Google 网络测试按默认配置跳过。这组诊断结果不作为原始完整套件全绿。
- `node scripts/package-windows.mjs --output .tmp/tech-stack-package` 生成 Windows x64 NSIS 安装包及便携版。实际 ASAR 的 8 个主进程、preload、worker 入口与 dist 哈希一致；包含 Koffi/Sharp Windows 原生文件，未夹带 TypeScript、Vite+、electron-builder。
- 对实际 `win-unpacked/Nexlet.exe` 运行 `smoke-package.mjs`，验证原生桥接、后台剪贴板监听、计算结果 384，以及内置文件搜索引擎搜索真实测试文件；对实际便携 EXE 运行 `smoke-portable.mjs` 通过。测试使用隔离用户目录；当前桌面的 Alt+Space 被其他应用占用，记录了快捷键不可用状态。
- macOS/Linux 原生构建与启动未在本机执行；相关 CI、锁文件解析和 ELF 架构检查已更新。未安装、发布、提交或推送。

本地证据保存在 `.tmp/tech-stack-*.log`、`.tmp/tech-stack-artifact-audit.json`。安装包 `Nexlet-0.2.34-Windows-x64-Setup.exe` SHA256 为 `CFA7D0AC3464A9ECA181FC878A25105882859A6357CC35544105961FFED9589B`；便携版 `Nexlet-0.2.34-Windows-x64.exe` SHA256 为 `43F1C017F1993883EB77D40F965A6DFD6F9F9587D1938603E4DE20763DE36152`。

Space「技术栈选型」已增加 `Language | TypeScript 最新版`，读回确认其余内容保留。
