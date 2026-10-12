# 本机固定签名验证计划

对应设计：`docs/superpowers/specs/2026-10-12-local-signing-design.md`。

1. 准备专用签名身份：证书、加密私钥和独立钥匙串保存在仓库外的用户目录，限制文件权限；先用临时可执行文件验证签名工具链及 DR，不能影响默认钥匙串配置或系统信任策略。
2. 增加可复用本机打包入口（`scripts/package-mac-local.mjs`、`package.json`）与使用说明（`README.md`）。复用 electron-builder 和现有 entitlements，强制指定身份，缺少证书必须失败；不修改 `package-lock.json` 依赖或现有远端发布流程。
3. 使用构建参数生成 `0.2.2-local.1` 和 `0.2.2-local.2` 两个验证产物，不修改源码版本；输出放在 `release/`。校验签名、证书指纹、互相兼容的 DR 和不同的代码哈希；校验 DMG。
4. 备份现有安装并安装第一个版本。由用户在系统设置授权，读取实际开关并验证测试文本回贴；安装第二个版本后再次验证，期间不操作权限记录。
5. 更新验证记录与文档，区分构建/签名通过、用户授权、真实回贴和跨版本保留结果；保留本机可复用凭据与最新测试通过的安装。

## 验证命令与副作用

- `node --check scripts/package-mac-local.mjs`、`git diff --check`：只读。
- 本机签名脚本：生成应用、DMG 和签名产物，使用专用钥匙串；不上传。
- `codesign --verify --deep --strict`、`codesign -d -r-`、`codesign -v -R ...`：只读签名验收。
- `hdiutil verify`：只读 DMG 验收；挂载/安装只作用于本次生成的安装包和 Nexlet 应用。
- CUA 操作测试文档与 Nexlet；首次授权交给用户，升级后不重新授权。

## 风险与回滚

自签名与实际 TCC 策略兼容性仍待验证；若失败，保留证据并恢复先前可用应用包。已有源码修改、用户数据及其他权限不变；不 commit、push 或发布。
