# 交互性能优化实施计划

对应 spec: docs/superpowers/specs/2026-10-16-interaction-performance.md。设计已获批准。

1. 原生唤起与搜索快照
   - 文件：src/main/platform.ts、src/main/index.ts、tests/platform.test.ts、搜索回归测试。
   - 行为：macOS 原生目标读取/回退；一次配置读取，搜索不执行完整 state 同步。
   - 验证：原生有效/空/异常、显示前目标记录；配置禁用/别名/网页搜索保持一致。
2. 分阶段搜索与 Worker 生命周期
   - 文件：src/main/content-matcher.ts、match-worker.cjs、src/shared/launch.ts、types.ts、src/preload/host.ts、src/renderer/Launcher.tsx。
   - 测试：tests/content-matcher.test.ts、新交互性能 E2E。
   - 验证：恶意正则仍可先展示普通结果；取消和跨窗口不串结果；Worker 正常复用、取消/超时/关闭回收；图标延迟不阻塞结果。
3. 剪贴板分页与虚拟列表
   - 文件：src/main/store.ts、index.ts、src/shared/types.ts、src/renderer/Clipboard.tsx、新摘要/虚拟列表 helper（按必要边界拆分）。
   - 测试：摘要分页/过滤/版本/详情单测；虚拟滚动、跨页选择、展开、LRU、独立窗口 E2E。
   - 验证：全文搜索和 Unicode、记录变化后的分页一致性、复制完整文本、收藏/中转权限、空状态和图片高度。
4. 前后比较与报告
   - 新增 scripts/benchmark-interactions.mjs；沿用启动 benchmark 的隔离、交替原则。
   - 冻结 after 构建；对比唤起、搜索、剪贴板、IPC、RSS；保存 docs/validation 中报告和 JSON。
   - 命令：npm run typecheck；npm test；npm run build；相关 playwright spec；node scripts/benchmark-interactions.mjs。
   - build 仅生成 dist，tests/benchmark 仅写隔离数据和报告；不触碰真实剪贴板、安装版或远端。

风险：分阶段结果使列表动态更新；需稳定选中 ID。虚拟列表变高与 detached 恢复需真实 Electron 验证。回滚方式见 spec。

## 完成记录

四个步骤均已完成。typecheck、build、441 项单测通过，最后调整 Worker 超时回收后另跑 20 项相关单测通过；最终 38 项相关 Electron 回归全部通过。虚拟列表新增了浏览锚点及图片展开行高回归。

最终 after 冻结在 `/tmp/nexlet-performance-after-tiut0n76`，完成预热后 5 轮交替测量。报告与原始结果分别为 `docs/validation/interaction-performance-2026-10-16.md`、同名 `.json`。未提交、推送、发布或安装。
