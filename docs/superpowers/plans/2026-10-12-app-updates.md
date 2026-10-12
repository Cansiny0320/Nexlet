# 应用更新实施计划

对应 spec：`docs/superpowers/specs/2026-10-12-app-updates-design.md`。

1. `src/main/updater.ts`、`src/shared/types.ts`、`tests/updater.test.ts`：用可注入 transport 验证状态转换、禁止降级/预发布、错误恢复、检查与下载分离、便携模式只检查下载链接；TDD 先运行 focused tests 确认失败。
2. `src/main/index.ts`、`src/renderer/Settings.tsx`（或独立更新面板）、`package.json`、lock：接入 electron-updater v6、受控 IPC、状态通知和重启清理。复用已有设置样式；不更改其他会话的 uTools 对齐工作。
3. `scripts/package-mac-local.mjs`、新增 CI 签名脚本、`.github/workflows/release.yml`、release-checksums：固定指纹签名与临时钥匙串清理、DMG/ZIP、Windows NSIS+portable、合并双架构元数据、严格检查发布文件。
4. 将已批准的加密 P12 与密码写入 GitHub Secrets，仅回读名称；私钥不进入日志/仓库/产物。以当前身份配置复用，不创建新证书。
5. 检查 `npm run typecheck`、`npm test`、`npm run build`、workflow lint、`git diff --check`。测试有生成 .tmp/dist 产物；打包生成 release/；GitHub 只读查询和 Secrets 写入有明确授权。现有外部无关 baseline 失败只记录。
6. 在隔离目录打包两版，执行真实 Mac 更新下载、签名校验、重启版本读回，反例验证错误签名不会安装。Windows 构建/安装更新按可用 Windows 运行环境验证，无环境时不得声称真实 Windows 升级已通过。完成后清理测试进程，保留用户现有数据与可恢复安装。
7. README 与 docs/validation.md 记录已实现、本地验收、CI/远端未执行边界。代码准备好后再形成具体 Git 提交/推送请求；不自动 commit、push、创建标签或公开 Release。

## 风险与回滚

更换证书会破坏身份延续；更新包缺架构、下载损坏、NSIS 与便携混淆、退出被窗口隐藏逻辑拦截是重点回归。更新失败保留旧版和原数据；暂停发布草稿即可阻止新的公开更新，已公开错误版本需更高版本修复，不能静默降级。Secrets 可独立移除，不影响本机证书。
