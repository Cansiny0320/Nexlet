# Nexlet 功能补齐实施计划

对应已批准 spec：`../specs/2026-10-25-ztools-alignment.md`。

## 环境与执行约束

- 主仓库 `D:/code/Nexlet`，初始 HEAD `b8baf26`，工作区干净。
- 插件仓库 `D:/code/Nexlet-plugins` 初始 HEAD `2727744`，工作区干净；远端已有 `0404b69` 的功能更新。只恢复本轮依赖且已审查的远端源码到工作区，保留其他内容，不 merge/commit/push。
- VPS 经 `ssh oracle` 可访问，为 ARM64 2 核，约 12 GiB 内存；Cloud Whale 容器和代理已运行，现有 HTTPS 8443，443 被占用。部署前再次核实资源、路由和证书。
- `pnpm check` 为只读格式/lint/type；`pnpm test` 为单元测试。`node scripts/build.mjs` 会生成 `dist`；插件构建/打包会生成 `.build`/`dist`。格式化仅针对修改文件。检查 E2E fixture 的原生输入副作用后才运行。
- 服务集成测试使用隔离数据库/临时目录；不得清理或重启现有业务服务，不读取密钥正文到工具输出。

## 1. 统一 AI 与能力提供商

文件：新增 `src/shared/ai.ts`、`src/main/ai-models.ts`、协议适配模块、`src/shared/capability-providers.ts`、`src/main/capability-providers.ts`、设置 UI；修改 `src/main/plugin-sdk/{ai,index}.ts`、`src/shared/plugin-api.ts`、`sdk/index.d.ts`、`src/preload/plugin-sdk.ts`、宿主 RPC、`src/main/index.ts`、OCR runner 和三语。

行为：实现三协议与共享模型设置；保留旧 API；显式迁移。OCR/translation 提供商注册、默认选择、调用生命周期、插件权限与云边界。接入现有 OCR/翻译/AI 动作源码。

测试：先增加协议 SSE、UTF-8 分片、工具参数、失败/截断/拒绝/取消、密钥地址绑定、提供商卸载与迟到响应、旧 API 兼容回归；本地 HTTP fixture，无真实付费模型调用。

通过条件：目标单测、类型检查和构建通过；实际 UI 能保存、列出、选择并调用共享能力；旧插件测试仍通过。

## 2. 截图编辑和长截图

文件：`src/renderer/Capture.tsx`、`src/main/screen-capture.ts`、`src/main/desktop-tools.ts`、`src/shared/capture.ts`；新增标注/拼接纯逻辑、编辑组件及相关样式；现有 OCR/翻译调用和结果交接。

行为：八类标注、对象编辑、撤销/重做、最终位图输出、OCR/翻译和长截图手动片段采集/调整。

测试：合成像素检查遮挡不可逆、箭头/文字/多屏坐标、历史栈、重复图/无重叠/误匹配、大小上限、取消；浏览器级 pointer fixture 验证工具条，不注入系统输入。

通过条件：复制/保存/贴图使用同一渲染结果，原有截屏与多屏测试通过，合成图目视 QA。

## 3. 市场安装更新

文件：`src/shared/marketplace.ts`、`src/main/marketplace.ts`、`src/main/plugin-staging.ts`、`src/main/plugins.ts`、`src/renderer/{Marketplace,Plugins}.tsx`、宿主 RPC；插件仓库 `scripts/publish.mjs`、索引生成和测试。

行为：可选详情/版本日志元数据，分类排序，逐项任务进度/取消/重试/更新列表；新增权限的安装预览及激活确认，后台更新不得绕过。

测试：旧索引、新字段不合法、网络中断、取消和校验失败、运行中更新、新增权限、停用/卸载竞态；沿用自动更新集成 fixture。

通过条件：离线旧版可用；更新 UI 与后台真实状态一致；原有自动更新行为保持。

## 4. 三个实用插件

插件仓库文件：新增 `plugins/pdf-tools`、`plugins/image-batch`、`plugins/batch-rename`；使用现有构建/发现/打包脚本，SDK 按主仓库同步脚本生成；按需增加有版本锁的依赖和许可证。

行为：按 spec 完成每个首版功能，支持输入文件/图片、明确输出、取消和逐项结果。不得自动覆盖输入文件。

测试：PDF 页数/顺序/旋转/渲染像素；图片尺寸/格式/水印/拼图；重命名循环、重名、大小写、失败恢复及外部改动后撤销。只使用临时 fixture 文件。

验证：插件 `npm test`、`npm run typecheck`、构建和 `.nexlet` 包校验；真实宿主使用临时 userData/模拟剪贴板加载产物。保留产物供用户审阅，不上传发布。

## 5. 公开账号和服务端同步

文件：主仓库新增 `server/` 独立 package/lockfile、Better Auth 配置、GitHub/设备授权页面、同步 API、SQL migrations、Dockerfile/compose、备份脚本和部署说明；新增共享同步合同与服务集成测试。

行为：公开 GitHub 注册，设备授权/撤销和账号删除；服务端认证隔离、100 MiB 配额、正文加密、版本冲突、删除记录、游标、幂等、请求限制。

测试：真实 PostgreSQL 迁移与事务；跨用户读写拒绝、重复提交、并发冲突、超额、附件未完成、删除和设备撤销；真实加密备份/恢复。OAuth 外部联调与凭据单独确认可用性，不打印秘密。

通过条件：容器 health、隔离数据库集成测试、恢复演练通过；没有访问 Cloud Whale 数据或修改现有代理。

## 6. 客户端账号与同步

文件：新增 `src/main/account.ts`、`src/main/sync/*`、`src/shared/sync.ts`、账号同步设置 UI；修改 store/RPC、设置、便笺/稿纸/剪贴板适配、缺失插件提示。

行为：登录/取消、加密凭据、类别选择、状态/配额/冲突/设备管理；本地 outbox 和增量同步；设备字段映射、秘密排除、账号切换隔离和首次导入预览。

测试：两个隔离客户端，离线编辑与重连、并发修改、删除后旧设备重连、账号切换晚到请求、重复上传、部分失败；历史与图片单独开关；秘密不能进入同步负载；插件清单不触发自动授权。

通过条件：双客户端 fixture 场景通过，断网仍可用，停止同步不会删除本机数据。

## 7. 完整验证与已授权部署

- 检查新增依赖的当前权威文档及脚本副作用，更新三语和用户说明。
- 主仓库 `pnpm check`、`pnpm test`、`node scripts/build.mjs`；有针对性的非侵入 E2E，必要时运行安全的全量子集。插件构建/打包/测试；服务类型与真实数据库集成测试。
- 独立 VPS 路径/容器部署；先备份 Nginx 配置、验证配置后 reload，不停止现有服务。同步 API 仅内网监听，由 HTTPS 反代访问。
- GitHub OAuth client ID/secret 通过安全服务器环境文件接入。若缺少，继续完成独立工作，最后报告真实阻碍，不用模拟登录替代生产验收。
- 验证 health、HTTPS、登录、两客户端同步与撤销；执行离机备份和恢复演练，回读现有服务仍健康。
- 记录修改、验证证据、未验证平台限制和部署状态。无客户端发布或 Git 收尾。

## 状态

- [x] 批准设计、只读核查、保存 spec/plan
- [x] AI 与 OCR/翻译提供商
- [x] 截图编辑/长截图实现与合成像素验证
- [x] 插件市场
- [x] PDF/图片/重命名插件
- [x] 账号同步服务
- [x] 客户端同步
- [x] 后台验证、VPS 部署、真实登录、离机备份与恢复

按用户后续要求，暂停所有 Electron／桌面窗口测试；最终视觉交互和真实多屏／长截图流程仍未验收。完整证据与既有失败见 `../../validation/2026-10-25-alignment.md`。
