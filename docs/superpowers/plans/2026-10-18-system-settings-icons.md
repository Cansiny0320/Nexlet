# 生成图标替换实施计划

依据：已批准的 imagegen 设计稿和同名 spec。沿用 writing-plans / executing-plans 流程，在当前会话实现。

1. 用内置 imagegen 将批准设计稿处理为无标签、透明背景的图集。核对全部 78 项语义、顺序和 alpha，保存原稿、最终提示词及清单到 assets/artwork/system-settings/。
2. 新增 scripts/render-system-setting-assets.mjs，按已核实的裁切边界提取每项，保留 alpha、规范留白，输出 assets/system-settings/*.png。该命令会重建本任务的图片资源。
3. 先修改 tests/system-setting-icons.test.ts 为生成图片的覆盖、独立性、优先级和兜底断言，运行确认旧矢量实现不满足。替换 src/renderer/system-setting-icons.ts 为静态资源导入表，并调整 common.tsx 的图片选择顺序。
4. 更新 tests/system-icons.spec.ts，验证固定、最近、搜索和主题切换后的图标一致性，并保留目录请求检查；生成图的 UI 验证在 Windows/macOS 都运行。
5. 运行定向 Vitest、npm run typecheck、npm run build 和定向 Playwright。构建写入 dist，Playwright 写入隔离测试目录和截图，不触碰真实配置。
6. 检查所有资源尺寸、透明边缘、非空内容，24/32/38 px 深浅背景总览，以及 Electron 界面。记录资源总大小、测试结果和平台验证边界，检查 git diff --check 后交付，不进行 Git 发布操作。

回滚只撤销本任务对应的资源与 ToolIcon 接入，保留用户其他改动。无关基线失败单独记录，不扩展修复。

## 完成与验证

- 内置 imagegen 完成透明化；原稿和三个阶段提示词保存在 assets/artwork/system-settings/。
- 78 张独立 128×128 RGBA PNG，总大小 2,342,429 字节。裁切脚本检查不切入物件，疑难解答的扳手跨过等宽网格，已按实际轮廓修正对应两格边界。
- 4 个定向 Vitest 文件共 13 项通过：生成图覆盖/优先级/兜底、资源透明边缘与内容去重，以及原生目录后端兼容性。
- npm run typecheck、npm run build 和 git diff --check 通过。
- Electron 集成：2 项通过，1 项 macOS 原生应用图标测试因 Windows 平台跳过。实际固定、最近、搜索及深色主题使用生成图片，naturalWidth 为 128。
- 78 项在 24/32/38 px 的组件渲染全部加载，共 234 张图片；深浅背景视觉检查无白底、裁切或明显杂色，页面无横向溢出。
- 尚未在 macOS 实机运行；未提交、推送、发布或替换已安装应用。
