# 性能优化实施计划

依照已批准 spec：`docs/superpowers/specs/2026-10-22-performance-optimization.md`。当前会话依次实施，不新增审批点。

完成状态：六个实施步骤已完成。七项热点均已处理，五组交替前后对照、587 项单测及 25 项相关 Electron 集成通过，check/build 通过。实测代价、无改善项与平台边界见 `docs/superpowers/reports/2026-10-22-performance-optimization.md`。用户随后授权仅提交并 push 性能改动；独立快照的 561 项单测、check/build 及相关 Electron 回归记录见报告。

## 基线

- 基线 HEAD：`74c7d6389f67a394c1b244c50582a8419ee70c94`，同时保存当前未提交的功能改动，不以 HEAD 代替实际基线。
- 独立普通源码快照：`/var/folders/v5/dc0qv_8d57v6_c5kws9d4p3w0000gn/T/nexlet-performance-20261022-fyfdqejs/before`。
- 同目录保存文件 SHA256、初始 Git 状态及 diff；不是 worktree。
- 使用 Node 24.19.0。测试创建临时 DB/合成数据，build 仅生成 dist，check 不加 fix。

## 1. 剪贴板存储、摘要与 Worker

文件：`src/main/store.ts`、新增 `src/main/clipboard-store.ts` / `clipboard-store-worker.ts`、`src/main/clipboard.ts`、`src/main/index.ts`、`src/renderer/Clipboard.tsx`、`scripts/build.mjs`、`tests/clipboard-pages.test.ts` 及新增服务测试。

先增加摘要/全文/Unicode/回填/旧版写入失效回归测试，再增加派生表和批量回填。服务接口沿用现有方法，通过 Worker 串行执行并传播异常、revision 和退出状态。逐一迁移读写 caller、board 权限与关闭清理；合并输入查询，不接受过期 response。设置与便签仍在原 Store。

通过条件：复制全文、排序/LRU、收藏、board、多窗口、分页 stale 合同通过；旧库可读取，Worker 退出可恢复，主线程无同步全文扫描。测试 `pnpm test -- tests/clipboard-pages.test.ts tests/clipboard-lru.test.ts tests/store.test.ts` 及新增测试。

## 2. 图片处理

文件：新增 `src/main/clipboard-image.ts`、`src/preload/clipboard-image.ts`，修改 `src/main/clipboard.ts`、`scripts/build.mjs`，增加 Electron 集成用例。

按需专用 renderer 保留 nativeImage 操作顺序和 PNG hash；只接收内部字节请求，取消外部导航/窗口，有限任务队列、错误/销毁清理、30 秒空闲回收，异步落盘。验证透明/大图/空图/重复图、进程崩溃、退出和排队处理，比较冷/热耗时、主线程延迟与 RSS。

## 3. 插件后台下载和延迟应用

文件：`src/main/marketplace.ts`、`src/main/plugins.ts`，必要时 `src/main/index.ts`；`tests/plugin-auto-update.test.ts` / `.spec.ts`。

先改测试证明开窗不等网络，再分开检查下载与应用阶段；暂存记住原安装身份、feature、版本和取消代次，复用当前原子安装、兼容校验及取消机制。成功检查 30 分钟节流，失败退避。下次无 session 才应用；旧版当前 feature 在新包缺失时继续打开旧版。

通过条件：慢网/断网立即打开，配置和密钥不丢失，运行中不重启，停用/卸载/退出不复活；本地插件不覆盖。

## 4. 状态和轮询

文件：`src/main/index.ts`、`src/shared/host-rpc.ts`、`src/preload/host.ts`、`src/renderer/App.tsx` / `Launcher.tsx`，`src/main/panel-native-worker.ts` 及相关测试。

更新状态单独事件；命令语义未变则不重搜，shortcut/startup 相关输入变化时才刷新。busy 先比较再读配置。macOS run loop 原生等待，控制消息可及时处理、按住阶段维持原节奏。验证 update 进度不触发搜索、真实命令变化触发搜索，短按/长按/拖动和退出，不修改 Windows 等待机制。

## 5. Linux 目录缓存

文件：`src/main/linux-search.ts`，`tests/linux-support.test.ts` 或新增目录缓存测试。

按目录身份和修改时间验证缓存，每次搜索仍检查目录，未变化不 readdir；仅对命中结果读取文件 metadata。有限容量、完整扫描标志、取消/超时保护。验证连续查询、创建删除重命名、目录替换、祖先删除、symlink/hidden、权限/扫描上限，比较 readdir/stat 数量。macOS 执行算法测试只能标为 Linux 分支模拟。

## 6. 综合验证、性能报告和交付

新增可重复 `scripts/benchmark-optimization.mjs` 或对应测试 fixture。用冻结快照与优化后相同输入交替测量，记录 p50/p95/事件循环阻塞和 CPU/RSS；首次/重复分别报告，不把局部加速换算为应用整体倍数。

运行 `pnpm test`、`pnpm check`、`pnpm build`、相关 `playwright test`。check 不带自动修复；如需要格式化，仅格式化本次文件/片段并复查已有改动。遵循测试结果修复本次问题，原有无关失败记录。

最终报告保存到 `docs/superpowers/reports/2026-10-22-performance-optimization.md`，包括真实数据、平台边界、未改善项、回滚方式和提交前隔离验证。依用户后续授权，精确拆分性能改动后 commit/push；不创建 PR 或发布。
