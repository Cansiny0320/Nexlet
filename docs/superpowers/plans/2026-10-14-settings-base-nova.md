# 设置页 base-nova 实施计划

依据：`docs/superpowers/specs/2026-10-14-settings-base-nova.md`，用户已批准。

1. 基线与回归：保留当前 dirty diff；Node 24 运行 `npm run typecheck`、`npm run build`；新增 `tests/settings-ui.spec.ts`，先验证统一高度与 DOM 菜单的失败基线。构建会更新忽略的 dist，测试写入隔离 .tmp 和 test-results。
2. 组件基础：新增 components.json、components/ui、lib/utils.ts、ui.css，更新 package.json/package-lock.json、vite.config.ts、tsconfig.json 和 main.tsx。使用官方 base-nova 源码，配置 Base UI、Tailwind Vite 插件和别名，复用现有主题变量，限制 reset 范围。
3. 页面迁移：修改 Settings.tsx、PanelSettings.tsx、CommandManager.tsx、UpdatePanel.tsx；按原有 value/onChange 合同替换控件。菜单在 SettingsSelect 内处理 Escape，共享 Modal 的既有交互保持不变。
4. 验证：更新 tests/electron.spec.ts 原生 selectOption 调用；运行 typecheck、build、settings-ui.spec.ts 与 entry-alignment.spec.ts 相关功能管理回归；检查主题、数值持久化、禁用、键盘与 640/800px 视觉。执行 git diff --check，核对已有 dirty changes 保留。

风险：CSS 层级改变、根字号与 rem 尺寸、菜单焦点事件、布尔控件语义变化。通过隔离层、显式尺寸、Electron 回归与截图核对；仅修复本次引入的问题。

回滚：移除本次新增组件/配置/文档与依赖，按文件 diff 撤销本次调用方修改；保留之前 Launcher.tsx/styles.css 用户改动，禁止整仓 reset。无外部资源创建或发布。

## 完成记录

- 已引入官方 base-nova 的 5 个基础组件，lucide 图标与本地 cn helper 适配；MIT 许可随 `assets/vendor/shadcn-ui/LICENSE` 打包。SettingsSelect 和 SettingsIconButton 是设置页的轻量组合。
- 已迁移设置页、超级面板配置、功能编辑/本地启动项、更新设置；原有专用业务列表与窗口标题栏不改变。
- 基线用例测得原生主题下拉框比输入框高 5.5px；迁移后统一为 32px。Portal 菜单、Escape 恢复焦点、Tab 移焦和方向键选择已验证。
- `npm run typecheck`、`npm run build`、`git diff --check` 通过；构建仅保留基线已有的 OpenCV Node 模块 externalization 和 OCR 大 chunk 提示。
- Electron 验证：`tests/settings-ui.spec.ts` 的 5 项通过；`tests/entry-alignment.spec.ts` 的别名/禁用、固定与最近、本地文件/目录 3 项通过。原测试的原生 selectOption 和有歧义的 getByLabel 已改为实际 combobox/option/switch 交互。
- 截图已人工检查：800px/640px、浅色/深色，菜单不裁切、页面无横向溢出；预览在 `.tmp/base-nova-preview/`。测试使用隔离数据目录和 `.tmp/base-nova-test-results` 输出。
- Launcher.tsx/styles.css 的既有改动和并行返回导航改动均未修改。本次未提交、推送、安装或发布；Windows/Linux 原生运行未在本机验证。
