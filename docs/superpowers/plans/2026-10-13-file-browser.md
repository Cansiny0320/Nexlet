# 文件浏览实施计划

依据：`../specs/2026-10-13-file-browser.md`，用户已批准并补充按文件类型区分 Icon。

1. `src/shared/everything.ts` 增加目录分页与文件信息合同；`src/main/file-browser.ts` 提供受窗口授权约束的目录读取和详情。`src/main/everything.ts` 关联搜索授权与生命周期，`src/main/index.ts`、`src/shared/types.ts` 接入 IPC。用 `tests/file-browser.test.ts` 覆盖任意路径拒绝、目录分页、过滤、元数据、错误及过期授权。
2. `src/renderer/FileSearch.tsx` 实现列表与详情、目录导航、搜索状态恢复、并发请求隔离；新增 `src/renderer/file-kind.tsx` 复用 lucide-react 分类图标，扩展 `src/renderer/filesearch.css` 适配窄窗口。
3. `tests/filesearch-browser.spec.ts` 以隔离的临时数据验证真实文件夹浏览、选择详情、类型图标、上一级、返回搜索、过滤、文件默认打开与删除错误；继续运行索引准备回归。

验证：先运行新增用例确认未实现，再执行 `npm test`、`npm run typecheck`、`npm run build` 和 `npx playwright test tests/filesearch-browser.spec.ts tests/filesearch-preparation.spec.ts`。构建写入 dist，E2E 只使用 .tmp 中独立数据和测试目录，不访问真实用户文件。

风险：文件系统变动、拒绝访问、大目录和异步响应竞态；使用实时 stat、分批枚举、窗口级授权及请求版本防护。目录读取不执行文件；默认应用打开行为在 E2E 使用 shell 桩验证。回滚只撤销本次文件改动，无持久化数据迁移。此次不提交、推送、打包安装。

## 完成与验证

- 已完成目录分页、当前目录筛选、元数据面板、分类图标、导航与搜索选择恢复。独立窗口恢复会重新授权，并继续枚举到此前选中的后续批次条目。
- `npm test`：178 项通过、2 项跳过；新增目录读取测试包含窗口隔离、分页、不递归、删除错误和在途请求失效。
- `npm run typecheck`、`npm run build`、`git diff --check` 通过。
- `npx playwright test tests/filesearch-browser.spec.ts tests/filesearch-preparation.spec.ts`：7 项通过，含真实 Everything 索引与文件系统浏览，以及模拟系统打开、拒绝访问和延迟详情响应。
- 已检查 `.tmp/filesearch-verification/file-browser.png`。测试修复了 `.ts` 被视频分类优先匹配的问题。macOS 界面未在本机运行；共用目录服务和已有 macOS 授权单测通过。
