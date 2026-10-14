# 官网迁移实施计划

对应设计：`../specs/2026-10-14-tanstack-migration.md`。本计划忠实转写已批准方案，不增加审批点。

1. **基线与脚手架**：读取并保留原三页面、资源、下载数据和测试；保存基线截图。新增 website/package.json、pnpm-workspace.yaml、pnpm-lock.yaml、tsconfig.json、vite.config.ts、components.json，更新 .gitignore 与 .openai/hosting.json。所有依赖安装和构建写入只在 website 下，依赖从 registry 下载；不注册资源或发布。
2. **SSR 页面与样式**：新增 src/routes、src/router.tsx、src/server.ts、src/components、src/styles；迁移模板为 JSX，保留正文、路由、metadata 和资源。资源移到 public/assets；以原 CSS 的视觉规则配合 Tailwind 和 base-nova 组件配置。删除旧生成器、DOM 事件脚本及不再使用的静态 dist。
3. **状态与交互**：迁移平台判断和 Release 解析为 TypeScript；以测试先固定边界，再实现 provider、Base UI 平台菜单、移动导航和复制反馈。验证用户手选与晚到响应、整组下载链接原子更新、超时/无效响应回退。
4. **构建与回归**：适配检查脚本至 SSR 响应，复用浏览器用例，增加路由切换与 hydration 验证。执行 `pnpm verify`（lint、typecheck、Vitest、build）、`pnpm format:check`、`pnpm test:browser`；构建后 Worker 本地预览，验证 metadata、静态资源、404、JS 禁用与多个视口截图。测试使用拦截响应，不触发真实下载或剪贴板写入。
5. **交付**：更新 website/README.md 和验证记录，记录命令、结果、具体限制。检查 diff 仅涉及 website；不 commit、push 或部署。停止本次启动的验证服务器。

测试命令不带自动修复；格式化显式执行，仅针对本次官网源码。build 写 dist、路由生成文件及 .wrangler；浏览器验证写 .qa。历史文档保留作为历史证据，更新当前 README 入口。

实施结果：五个步骤完成。生成的 `src/routeTree.gen.ts` 随源码保留，以保证干净 checkout 的类型检查不依赖先启动开发服务。旧资源/静态产物以本地忽略目录备份后移除旧路径。验收结果见 `../validation-2026-10-14.md`。

若 baseline 失败，记录错误并区分迁移影响。仅修复本次迁移引起的问题。回滚与授权边界见 spec。
