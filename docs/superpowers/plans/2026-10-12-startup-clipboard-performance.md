# 实施计划：启动与 macOS 剪贴板性能

已批准 spec：docs/superpowers/specs/2026-10-12-startup-clipboard-performance.md。

1. 冻结基线并验证：.tmp/performance-2026-10-12/before 保存源码及构建配置，baseline-manifest.json 保存 Git 状态和 SHA256。在快照执行 npm run typecheck、npm test、npm run build；只生成隔离目录产物，不自动修复或联网。无关 baseline 失败记录，不自行修复。
2. 原生变更检测：新增 src/main/mac-pasteboard.ts，修改 src/main/platform.ts。先添加 mac-pasteboard/platform/capture 测试，验证稳定、变化、null 降级、强制读取、失败重试及并发捕获。独立原生进程验证真实 API 后接入现有 sequence()。
3. 按需加载及交接：修改 src/renderer/App.tsx，新增小范围工具加载/挂载边界模块；按需修改 src/renderer/tool-session.tsx。新增 lazy-tools.spec.ts，复用 alignment/tool-handoff 回归，覆盖慢加载时不能提前完成交接、错误保留源状态和普通加载失败可返回首页。
4. 性能脚本：新增 scripts/benchmark-performance.mjs（及必要的隔离场景辅助），参数指向 before/after 应用目录，输出 JSON 原始样本；固定数据、尺寸、采样时点及退出清理。after 仅从 before 应用本次文件后构建，记录源码差异清单。
5. 验证及测量：Node 24；npm run typecheck；npm test；npm run build；npx playwright test tests/lazy-tools.spec.ts tests/alignment.spec.ts tests/window-behavior.spec.ts；git diff --check。运行已审查基准脚本，保存 10 对启动样本与内存/CPU/剪贴板读取次数、真实 macOS 序号变化证明。修改引入的失败修复后重验，已有无关失败单列。
6. 交付：docs/validation/startup-clipboard-performance-2026-10-12.md 写环境、方法、表格、中位数与范围、限制、原始结果路径。说明本地实现和验证，不声称部署。

回滚：只还原本次文件/增量，保留用户已有改动；不执行 reset/checkout、commit、push、worktree、远程发布。

## 基线核查补充
首次工作目录快照因同期未完成的更新器重构出现 TS18004（autoUpdater），保存在 .tmp/performance-2026-10-12/initial-working-snapshot。性能对照改用已提交版本 b807c092d3539aebce74107430cc47076394c72a 的 before 快照；after 仅叠加本次优化文件。未修改或修复其他人的更新器代码。

## 完成记录

实现与测量已完成，详见 docs/validation/startup-clipboard-performance-2026-10-12.md 和同名 JSON 原始结果。导航使用 useTransition 消除首次切换中额外的 Suspense 等待。资源测试使用独立保护进程和权限 0600 的剪贴板临时备份，恢复回读成功后删除。

当前工作区 typecheck、150 项 unit、build 通过；相关 E2E 15 通过、2 项系统焦点断言失败，未优化基线同样失败。安装版重启因 Mac 锁定待恢复。本次未 commit、push 或安装。
