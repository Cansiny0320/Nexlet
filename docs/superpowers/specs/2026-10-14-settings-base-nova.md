# 设置页基础组件迁移

用户已批准：采用 shadcn/ui `base-nova`（Base UI），建立共享基础组件，本次迁移完整设置页。

## 范围与行为

- 新增 `src/renderer/components/ui`，从官方 base-nova registry 引入 Select、Switch、Button、Input、Textarea；沿用 lucide-react。
- Settings、PanelSettings、CommandManager 和 UpdatePanel 中的表单控件统一使用基础组件；功能编辑中的布尔选项使用 Switch。业务列表行和窗口标题栏保持现有专用交互。
- 接入 Tailwind CSS 与 shadcn 配置，映射现有浅色/深色主题；限制 reset 作用范围，保留 Launcher.tsx、styles.css 已有未提交的可读性改动。
- 下拉框尺寸与相邻控件一致，菜单通过 Portal 渲染，避让窗口边缘。Escape 先关闭菜单并恢复焦点，不返回启动页。
- 保留设置字段、IPC、自动保存/显式保存及错误提示语义，不变更后台合同。

## 审查结论

现有原生 select 与手写 toggle 缺少统一组件层。接入风险包括全局元素 CSS 覆盖、Portal 脱离页面容器后主题/裁切、App 全局 Escape 处理，以及原生 selectOption 测试失效。分别通过 CSS 层与局部 reset、根节点主题变量、菜单键盘回归和真实选项点击测试验证。

## 验收

类型检查、构建通过；Electron 隔离数据目录验证主题、数值设置、开关、功能编辑和本地项保存；浅色/深色、640px/800px、滚动边缘菜单布局正常；禁用控件不写入；Escape、方向键、Enter、Tab 行为正常。

不执行 commit、push、安装或发布。
