# 系统搜索实施计划

对应已批准 spec：`docs/superpowers/specs/2026-10-13-system-search.md`。

1. **系统应用索引和搜索**
   - 修改 `src/main/catalog-mac.ts`、`catalog.ts`、`src/shared/search.ts`。
   - 批量读取本地化名称，失败回退英文名；补充明确系统目录；ID 保持不变；归一化别名与拼音。
   - 在 `tests/catalog-mac.test.ts`、新索引/关键词单测验证缺失目录、失败回退、稳定 ID、英文与中文别名。
2. **平台设置和固定系统动作**
   - 新增 `src/main/system-commands.ts`、`system-actions.ts`、平台执行模块；扩展 `src/shared/types.ts` 的 system kind。
   - 使用 Windows 官方 ms-settings URI，按版本过滤；macOS 使用已核实的系统设置标识。保留静态注册与执行隔离。
   - 单测覆盖设置矩阵、平台隔离、确认取消、API 错误、未知 ID、并发重复执行。Windows 睡眠使用正式 Win32 API，处理权限和返回值；不照搬 rundll32 调用约定。
3. **启动器集成**
   - 修改 `src/main/index.ts`、`src/renderer/common.tsx`、`Launcher.tsx`。
   - 系统命令进入统一搜索，主进程确认；只有成功才写 recent/隐藏窗口；取消保留输入；执行失败恢复可见状态。
4. **验证**
   - 先运行新增聚焦单测观察失败，再实现并通过。
   - `npm run typecheck`、`npm test`、`npm run build`、`npx playwright test tests/system-search.spec.ts` 及相关索引 E2E、`git diff --check`。
   - build 生成 ignored dist；E2E 写隔离测试目录和报告，使用测试替身，不执行真实电源操作。不安装、不上传、不发布。

## 风险与回滚

系统设置 URI 随 OS 版本变化，按支持版本筛选；平台执行错误须传播。Windows 缺少真机时不能宣称真实睡眠通过。保留开始时 README、插件模块及对应测试的并行改动。回滚仅撤销本计划涉及的改动，不重置工作区；无需数据库迁移。

## 完成与验证记录

- 已实现 macOS 13+ 的 31 个设置入口、Windows 10 的 70 个入口、Windows 11 的 66 个入口，以及两端各 6 个系统动作。Windows 11 不注册已过时的平板模式、共享体验、同步个性化、旧备份页面。
- macOS 应用本地化、英文别名、CoreServices/Applications 和 Finder 索引已落地；本机实际索引 114 个应用与快捷方式。31 个设置目标均与本机扩展 bundle ID 匹配。
- `PATH=/Users/bytedance/.nvm/versions/node/v24.19.0/bin:$PATH npm test`：36 个文件、329 项通过。
- `npm run typecheck`、`npm run build`、`git diff --check`：通过。build 只生成 ignored dist。
- `npx playwright test tests/system-search.spec.ts tests/catalog-icons.spec.ts tests/catalog-dedup.spec.ts`：8 项通过，1 项 Windows 快捷方式用例因当前是 macOS 跳过。覆盖真实索引/IPC 搜索、默认取消、取消保留输入、不记录失败、成功隐藏窗口、URI 白名单、失败重试和应用图标。
- 原生 UI 实测：隔离数据的本地构建分别搜索并打开“声音设置”“显示器设置”“蓝牙设置”，确认系统设置窗口最终标题分别为“声音”“显示器”“蓝牙”；未修改任何设置值。隔离测试实例已关闭。
- 电源、会话和锁屏操作均使用替身验证。Windows 原生 API 参数、权限获取/还原、失败传播和 handle 清理有单测，但尚未 Windows 真机执行；不宣称真实睡眠或关机已经验收。
- 初次全量单测使用环境默认 Node 20.19.4，已有 store 测试因缺少 `node:sqlite` 无法加载。按项目 engines 切换已有 Node 24.19.0 后全部通过，未修改数据库代码或安装运行时。

实现依据：Windows [设置 URI](https://learn.microsoft.com/en-us/windows/apps/develop/launch/launch-settings)、[SetSuspendState](https://learn.microsoft.com/en-us/windows/win32/api/powrprof/nf-powrprof-setsuspendstate)。睡眠直接调用 Win32 API，区分睡眠与休眠、保留唤醒事件；没有复用 uTools 的 rundll32 调用方式。macOS 显示桌面使用系统 Mission Control 程序的固定参数 1，本机静态反汇编/常量表核实其对应 `com.apple.showdesktop.awake`。
