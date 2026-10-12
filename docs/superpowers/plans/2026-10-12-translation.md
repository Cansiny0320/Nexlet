# 翻译插件实施计划

依据 ../specs/2026-10-12-translation.md，设计已经用户批准。

1. 宿主网络与密钥能力
   - 新增 src/main/plugin-network.ts、plugin-secrets.ts 和 tests/plugin-network.test.ts、plugin-secrets.test.ts。
   - 先编写行为测试并运行，确认缺失实现导致失败，再实现。验证 origin/方法/头部/大小/超时/取消/并发边界，以及系统加密不可用和插件隔离。
   - 扩展 src/shared/types.ts、plugin-validation.ts、src/main/plugins.ts、plugin-runtime.ts、src/preload/plugin.ts、src/renderer/Plugins.tsx。既有权限与 renderer 网络封锁保持兼容。
2. 翻译插件
   - 在 ../Nexlet-plugins/plugins/translate/ 新增 manifest、HTML/CSS/JS、图标和许可证；协议逻辑可独立测试。
   - 原文和译文并列；Google/LLM、语言选择、配置、复制、快捷键、取消和状态。普通配置存储与密钥分开，进入时接收宿主输入，不自动翻译。
   - 新增独立 Node tests，不覆盖插件仓库已有 package.json/tests 改动。测试 Google 分段/检测语言、LLM 请求响应、配置校验和错误。
3. 集成与文档
   - 更新 docs/plugin-sdk.md、插件仓库 README/index.json；确定兼容版本门槛。新增 tests/translation.spec.ts，用临时用户数据目录及本地 HTTP fixture 验证 Electron 真实桥接/UI，并验证 Google 真实样例。
4. 验证与交付
   - npm exec vitest run tests/plugin-network.test.ts tests/plugin-secrets.test.ts；npm run typecheck；npm test（均无自动修复）。
   - 插件 node --test tests/translation.test.mjs；python3 scripts/package.py（写入忽略的 dist 插件包）。
   - npm run build（生成忽略的 dist）；npm exec playwright test tests/translation.spec.ts（启动隔离 Electron，写入 test-results，不触碰日常用户数据）。
   - git diff --check，检查 diff 和安装包 manifest。记录既有失败，不修改无关功能。真实 LLM 没有凭据则明确未验。

风险：免 Key Google 接口可能变化、网络不可达；跨平台密钥后端不同；新 SDK 需要新宿主。通过受控 fixture 验证协议与错误分支，真实 Google 验证只作为当次结果。回滚只撤销本次文件和本次修改的行，不回退其他并行改动；不操作 Git 远端。

## 完成记录
- 已实现宿主 HTTP/密钥桥接、权限文案与 SDK 文档；宿主源码版本 0.2.7，翻译插件 1.0.0，目录最低宿主版本 0.2.7。
- 新增网络和密钥测试 11 项、翻译协议测试 4 项；宿主全量 150 项与插件仓库全量 12 项通过。Node 24.19.0 下 typecheck/build 通过。
- Electron 翻译 6 项用例（含 Google 实网）通过。随后修正默认窗口底部溢出、补充配置未保存时禁止 LLM 翻译；复验 5 项通过，实网用例按默认开关跳过（协议未变）。旧插件生命周期/分离/崩溃 2 项通过。
- 最终 .nexlet 与源文件逐字节一致，manifest/index/宿主版本一致；两仓库 diff --check 通过。
- 类型检查期间曾遇到其他并行更新中的 autoUpdater/DownloadOptions 等错误，未修改这些文件；后续检查已通过。
- Google 使用公开 Hello, world! 实测返回「你好世界！」；LLM 使用本地 OpenAI-compatible fixture，真实供应商凭据未提供，未宣称真实 LLM 服务验证。未 commit、push 或发布。

## Push 前修正
- 已发布 v1.1.0 不含翻译包；翻译目录单独预留 v1.2.0，现有插件保留 v1.1.0 地址，避免主分支索引使现有插件下载失效。打包标签校验改为至少一个条目匹配，并新增保留历史 URL/拒绝无关 tag 的回归测试；插件仓库 13 项通过。
- 宿主单仓 CI 缺少相邻插件源码时明确跳过翻译跨仓用例，支持 NEXLET_PLUGINS_DIR 指定源码；完整跨仓验证仍在本地执行。测试自行生成临时 ZIP，不依赖未提交的 dist 文件。
