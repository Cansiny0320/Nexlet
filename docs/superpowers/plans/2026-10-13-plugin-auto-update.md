# 插件自动更新实施计划

依据已确认的 `docs/superpowers/specs/2026-10-13-plugin-auto-update.md`，使用 writing-plans 保存计划后，在当前会话按 executing-plans 执行。

1. **失败用例**：新增 `tests/plugin-auto-update.test.ts` 和 `tests/plugin-auto-update.spec.ts`。覆盖下载截止时间和取消，以及 Electron 中先更新再打开、缓存刷新、重复打开、数据/输入保留、已有会话、本地导入、坏包回退、取消后不复活。先证明当前实现不自动更新。
2. **市场准备**：修改 `src/main/marketplace.ts`，复用有界下载器并支持调用级超时和取消；增加仅准备并校验包的自动更新路径。检查 2 秒、下载 10 秒；失败不改变安装记录。
3. **启动与替换**：修改 `src/main/plugin-runtime.ts`、`src/main/plugins.ts`，在串行启动创建会话之前准备更新，已有会话跳过；替换提交前检查记录/启动有效性。修改 `src/main/index.ts` 连接准备回调，保留并行开发已有代码。
4. **文档与验证**：更新 `docs/plugin-sdk.md` 和 `README.md` 的更新行为说明。运行聚焦单元测试、类型检查、构建、新增 Electron 用例，以及现有插件市场和翻译回归。

验证命令：`npm exec -- vitest run --config vitest.config.ts tests/plugin-auto-update.test.ts tests/marketplace.test.ts tests/plugin-bundle.test.ts`；`npm run typecheck`；`npm run build`；`npm exec -- playwright test tests/plugin-auto-update.spec.ts tests/translation.spec.ts`；市场回归使用 `tests/electron.spec.ts --grep 插件市场缓存`；`git diff --check`。

构建会写 dist；Electron 测试使用隔离临时数据目录。新增用例使用受控下载 fixture，不访问真实用户数据或外部服务；现有 Google 实网回归仅通过显式 `NEXLET_TRANSLATION_LIVE=1` 启用。

风险：并行用户改动涉及启动入口和运行时，采用最小补丁、不覆盖整文件；网络期间状态改变须在提交前再次检查。新增版本运行后自身故障不属于下载回退，不承诺数据迁移回滚。

回滚：移除本次准备回调与自动替换入口，即恢复手动市场更新；安装数据合同未变。保留其他任务的改动，不执行 destructive Git 操作。无 commit、push 或发布步骤。
