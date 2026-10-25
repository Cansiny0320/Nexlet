# 2026-10-25 功能补齐验证

范围：已批准的共享 AI、OCR／翻译提供商、截图编辑／手动长截图、插件市场、PDF／图片批处理／批量重命名、GitHub 登录与跨设备同步。主程序本地版本 0.2.47；未 commit、push、发布客户端或公开插件包。

## 主程序

- `node node_modules/vite-plus/bin/vp check`：格式、lint、类型通过。
- `node node_modules/vite-plus/bin/vp test`：101 个测试文件通过、2 个跳过；644 项通过、4 项跳过。
- `node scripts/build.mjs`：通过，保留现有 CommonJS／大 chunk 提示。
- 本机 `pnpm` shim 指向缺失的 pnpm 12.14.0 文件，因此使用项目已安装的 Vite+ 入口；没有修改全局包管理器。
- 三种 AI SSE 测试覆盖分片、工具参数、usage、拒绝、截断、中断、取消和推理参数；没有调用真实付费模型。
- 实际 PNG 像素验证实色遮挡、高亮、拼接与重叠；提供商测试覆盖停用、更新、取消、错误和默认选择。
- 同步测试覆盖持久队列、两个隔离客户端的离线冲突／删除、账号隔离、取消后迟到结果、撤销令牌、字段投影和 SQLite 原子回滚。便笺只同步明确的 note 字段；私有插件库不全量上传。
- 六个实际 `.nexlet` 包均通过宿主安装解析器，包括 provider 入口和包大小／路径校验。

## 插件

本地文件位于 `D:/code/Nexlet-plugins/dist/`：

| 包 | 版本 |
| --- | --- |
| pdf-tools.nexlet | 1.0.0 |
| image-batch.nexlet | 1.0.0 |
| batch-rename.nexlet | 1.0.0 |
| ai-actions.nexlet | 1.1.0 |
| ocr.nexlet | 1.2.0 |
| translate.nexlet | 1.4.0 |

`npm run typecheck` 通过；六个定向构建和打包通过。目标测试 16 项通过，含 PDF 页顺序／旋转、PDF.js 在 Node 中渲染实际像素、PNG/JPEG/WebP 编码和水印、重命名循环／部分恢复／拒绝覆盖外部修改。

插件仓库全量 `npm test` 在新增 PDF 渲染测试之前为 62 通过、1 失败。失败为原有 `tests/packaging.test.mjs:17` 对插件 ID 使用固定映射，而 HEAD 的市场目录已包含 `org.nexlet.text-image`；比较 HEAD 源码确认不是本轮引入。该旧用例未擅自修复，不能宣称插件全量测试通过。

## 服务与真实登录

- 独立部署 `/opt/nexlet`，`nexlet-app-1`／`nexlet-db-1`，不同于现有 Cloud Whale 服务。
- `https://161.33.217.59:8443/nexlet/health` 返回 `ok: true, loginConfigured: true`。
- GitHub OAuth 应用已创建并配置精确回调；Client Secret 仅保存于 root-only 环境配置和受限备份。临时传输文件已删除。
- 在 Chrome 完成真实 GitHub 授权回调、设备确认、令牌兑换、`/api/me`、同步拉取、100 MiB 配额和设备列表检查；验证会话随后撤销，后续鉴权返回 401。没有上传用户本地内容。
- 真实 PostgreSQL 隔离测试覆盖设备 grant、跨账号隔离、并发版本、幂等、配额、删除标记、设备撤销和账号删除。独立测试数据库执行恢复后已移除。
- AES-GCM 加密正文通过 `pg_dump` → 新数据库恢复 → 解密比对；恢复演练通过。
- 每日备份保留 7 天；本次离机备份另存到 `C:/Users/11368/.nexlet-backups/oracle/`，目录仅当前用户及 SYSTEM 可读。离机复制目前是部署时的一次性操作，每日任务仍在 VPS 本机。
- 总库 10 GiB／可用磁盘 1 GiB 保护已部署；原 Cloud Whale web/db 仍 healthy，worker 仍运行；未占用代理的 443。

## 明确未验证

用户在游戏中要求不运行弹窗测试后，没有再启动 Electron／桌面窗口测试。此前受控隐藏 Electron fixture 完成过真实 OCR 和截图遮挡验证，但不代表最终整套 UI 已验收。最终视觉交互、真实多屏／系统屏幕权限、手动长截图的桌面流程，以及 macOS/Linux 实机行为尚未验证。Linux 重复长截图采集明确不支持。PDF 像素检查在纯 Node 环境进行，不替代最终插件窗口交互验收。

功能说明见 `../alignment-features.md`，SDK 合同见 `../plugin-sdk.md`，部署／备份／回滚见 `../../server/README.md`。所有源码和安装包保持本地未提交状态。


## 2026-10-26 修复与发布复验

- 正式修复翻译布局：主区域按剩余高度分配空间，恢复语言选择器自称。翻译套件包括默认、大窗及窄窗回归；真实 Google 接口仍按默认配置跳过。
- 首次安装确认权限、同权限更新静默的断言分开验证；更新了受影响的 Electron 安装准备步骤。自动更新 11 项通过；翻译 8 项通过、1 项跳过。插件市场缓存、任务确认、更新及数据保留用例通过；语言切换用例复验通过。
- 插件仓库接入远端已有的打包兼容性 fixture 修复，`npm test` 64 项全部通过，`npm run test:ctool` 10 项通过；全量类型检查、构建、候选目录生成及 10 个插件打包通过。
- 新插件的 changelog 统一使用市场协议的 notes 字段。宿主实际包解析和候选市场目录检查共 7 项通过。Ctool 1.1.4、text-image 1.1.1 随共享 SDK/构建依赖重新构建，按不可变发布约定递增补丁版本。
- 主仓库完整单元测试 644 项通过、4 项跳过；后续新增候选市场目录检查单独通过。Vite+ 格式、lint、类型检查和构建通过。
- Electron 功能与设置测试 9 项通过；新增工作台实际运行验证 3 项通过：PDF 预览/页面重排/PNG 像素、图片缩放/水印/拼图、重命名执行/撤销均检查实际文件结果。使用合成文件、隔离 userData，没有注入原生键鼠。
- 本地 `server/npm test` 的容量测试通过，PostgreSQL 集成测试因未设置独立 nexlet_test 数据库而按前置断言拒绝运行。此前 VPS 上的独立数据库验证记录仍有效；本轮没有修改服务端实现。
- 桌面原生输入、真实系统截图权限、手动长截图的完整桌面操作仍未在本机执行；平台打包与完整桌面套件交给发布 CI 验证。

### 跨平台发布检查

- CI run 40211321115 的 Windows x64、macOS Intel、macOS Apple Silicon、Linux x64 和 Linux arm64 构建、单元测试、安装包生成及冒烟检查均通过。
- Windows 完整桌面套件：133 项通过、22 项按平台或外部依赖条件跳过。Windows 单元测试：640 项通过、11 项跳过；构建后的配套插件包在本机另行验证。
- CI 发现的路径过滤问题已修复：Windows、UNC 和 Unix 文件路径统一只保留文件名；没有 files 数组的旧文件条目也使用相同规则。新增回归与同步引擎共 11 项通过，随后各平台 CI 通过。
