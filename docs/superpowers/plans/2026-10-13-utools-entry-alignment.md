# 功能入口对齐实施计划

依据：[已批准 spec](../specs/2026-10-13-utools-entry-alignment.md)。保留现有 dirty changes，不创建 worktree，不 commit/push/发布。

1. **配置与命令层**：新增 `src/shared/command-config.ts`、`src/main/command-registry.ts`，扩充 `src/shared/types.ts`，复用 `src/shared/search.ts`（实现后确认无需修改该文件）。独立配置、别名、禁用、稳定本地项 ID、固定/最近兼容、revision。`tests/command-registry.test.ts` 先验证禁用、并发重排及迁移。
2. **网页模板**：新增 `src/shared/web-shortcuts.ts`，接入 `src/renderer/Tools.tsx` 及主进程。按 ID 编辑/删除，旧网址保留；`tests/web-shortcuts.test.ts` 验证中文、&、百分号、空查询、authority 变量与协议限制。
3. **执行与热键**：新增 `src/main/shortcut-manager.ts`，抽出主进程共用执行函数；修改 `src/main/plugin-runtime.ts`、`src/main/tool-handoff.ts`、`src/renderer/App.tsx`。复用窗口而不重置输入，交接/弹窗保护，失败回滚与状态反馈。`tests/shortcut-manager.test.ts` 用可控注册器验证竞争、互换、保存失败；Electron 验证实例/内容保留。
4. **管理及启动器界面**：新增命令管理组件，接入 Settings；改造 Launcher 网格/列表、按 ID 选中、菜单别名/快捷键/禁用、固定移动与最近移除；本地项选择/编辑。样式只扩充本批相关内容。
5. **逐项验收和对比**：`npm run typecheck`、`npm test`、`npm run build`、`npx playwright test tests/entry-alignment.spec.ts tests/alignment.spec.ts tests/system-search.spec.ts tests/window-behavior.spec.ts`、`git diff --check`。先看脚本副作用：build 写入忽略的 dist，Electron 测试使用临时 userData、拦截外部打开、关闭真实系统操作，不部署或修改用户数据。若已有失败，记录而不扩大修复范围。

## 风险与回滚

- 系统、插件与官网正有并行改动，编辑前回读当前文件；`.tmp/utools-entry-baseline` 保存本批前文件及 diff 用于比对，不覆盖恢复整个工作区。
- OS 热键注册不是跨进程原子事务；本实现保证注册失败和本地保存失败时保留先前有效映射，启动冲突报告未生效。
- 旧数据库保持可读；回滚仅撤销本批 diff 和新增文件，保留独立配置文档不会改变旧程序原有配置。
- Windows 运行态与真实 OS 热键需要对应系统验收；本机隔离测试和注册器单测分别报告证据等级。

## 进度

- 第一批八项功能已实现。配置与热键的关键行为先写失败测试，再实现；Electron 验证覆盖管理界面与实际主进程/renderer 链路。
- 保留自有 SDK、输入授权、旧 pinned/recent/web ID，以及并行完成的系统搜索和插件调整。别名直接合入已有关键词检索，无需重复实现拼音算法。

## 逐项对比（2026-10-13）

uTools 对照基线为本机 **7.8.0** 的 REA 静态证据与先前核查的官方文档。安装包自动分析为 partial，本机 uTools 界面抓取未成功，因此下表不是双方逐项真机测试结论。Nexlet 实现和测试基于当前 **0.2.11 源码加本轮本地改动**，未打包安装或发布。

| 功能 | uTools 对照目标 | Nexlet 本批实现 | 验证与边界 |
|---|---|---|---|
| 功能别名 | 自定义功能指令 | 右键或设置中按功能保存多个别名，支持中文、拼音和首字母检索 | 单测及 UI 检索通过；名称和 command ID 保持不变 |
| 功能快捷键 | 直接打开某一功能 | 唤起键与功能键共用管理器；冲突/保存失败保留旧绑定，显示配置与生效状态；再次打开优先复用独立窗口和原内容 | 注册器冲突/互换/回滚单测通过；JSON 草稿与插件资源 token 保留的 Electron 测试通过。真实 OS 按键及 Windows 实机待验；自动复制系统选区属于后续批次 |
| 按功能禁用 | 单独停用指令 | 隐藏普通搜索、内容匹配及固定项中的对应功能；旧结果和热键执行时再次拦截；其他插件功能保持可用 | 禁用、重新启用、插件不可用状态与配置保留通过 |
| 固定排序 | 整理常用入口 | 右键前移/后移、固定/取消固定；旧重复快捷方式 ID 先解析后操作；重排校验 revision | 原数据兼容与过期重排拒绝单测通过，UI 排序通过 |
| 最近管理 | 管理历史入口 | 最近记录去重、排除已固定项、移除单条；外部打开失败或取消不记成功 | UI 去重/移除、原系统执行成功/取消/失败回归通过 |
| 本地启动项 | 管理文件、目录入口 | 设置中选择或填写路径，添加、改名、改路径、删除；UUID 不随路径变更；搜索与快捷键共用执行入口 | 文件/目录目标、稳定 ID、文件移动、删除后的旧命令拦截通过；测试拦截 OS openPath，不启动真实外部程序 |
| 网页搜索 | 固定网页与搜索模板 | 保留旧网址；显式单目标 {query} 模板，名称/别名加查询，空查询弹窗；变量限制在固定 HTTP(S) 主机之后并正确编码 | 中文、&、百分号、非法模板、旧网址、编辑/删除、弹窗阻止其他热键通过。指定浏览器与多站打开留待后续 |
| 列表展示 | 多种结果展示形态 | 网格/列表切换，保存展示偏好，共用选中 command ID、键盘与右键操作；中文输入法与重复 Enter 不执行 | 切换保留选中项、键盘切换、IME/repeat 及现有应用图标回归通过；主搜索插件数据聚合另属后续宿主能力 |

入口：搜索结果或固定项右键 → **别名与快捷键**；设置 → **功能管理 / 本地启动项**；网页快开 → **搜索模板**；启动器底部 → **网格 / 列表**。

官方对照入口：[功能快捷键](https://www.u-tools.cn/docs/guide/global-shortcut.html)、[本地启动](https://www.u-tools.cn/docs/guide/local-file-launch.html)、[搜索框](https://www.u-tools.cn/docs/guide/uTools-search-bar.html)、[网页快开](https://www.u-tools.cn/docs/guide/plugin-open-web.html)。本地 REA 证据索引为 `.tmp/utools-comparison-2026-10-13-evidence-index.json`，安装包 ASAR SHA256 为 `dfb382d5a8daba34c06dd9a035da66f896c0b53d3bc85b2031e164fce08ad272`。

## 验证结果

统一使用本机 Node 24.19.0；默认 shell 的 Node 20 无 `node:sqlite`，初次单测失败属于运行时版本不符合仓库要求。

- `npm run typecheck`：通过。
- `npm test`：39 个测试文件、342 项测试通过；本批新增 13 项单元测试。
- `npm run build`：通过，写入忽略的 dist；没有上传、安装或部署。
- `npx playwright test tests/entry-alignment.spec.ts tests/alignment.spec.ts tests/system-search.spec.ts tests/catalog-icons.spec.ts`：27 项通过，其中本批 9 项；未出现 renderer 脚本异常。
- `git diff --check -- src tests docs/superpowers`：通过。
- 列表截图经人工视觉检查，保存在 `.tmp/utools-entry-validation/launcher-list.png`。

额外回归的既有失败已用 `282310a1830d2d2db048d0c56148ef3308dd6bdd` 的独立临时源码副本复现，未修改这些测试或无关实现：

- `tests/window-behavior.spec.ts`：1 项通过、2 项焦点断言失败。窗口可见且未最小化，但本机环境中的 `isFocused()` 返回 false；本轮不宣称原生焦点验收通过。
- `tests/electron.spec.ts` 首项默认要求 Windows `.lnk` 类型并调用 Windows API，本机 macOS 在首个 `kind === shortcut` 断言失败；串行后续 10 项因此未执行。新功能相关的独立 Electron 用例已单独通过。

后续仍有：系统选区/超级面板、截图取色贴图、动态插件功能/子输入框/主搜索数据、后台生命周期、工具生态，以及 AI/MCP/云服务。本批没有将这些缺口标为完成。
