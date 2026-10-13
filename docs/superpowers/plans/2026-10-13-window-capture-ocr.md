# 实施计划

批准来源：本会话 2026-10-13 用户确认。执行于当前 checkout，保留前两批及其他会话修改。

- [x] 窗口布局与原生目标：新增 `src/shared/window-layout.ts`、`src/main/window-actions.ts`、`src/main/window-native.ts`，接入 `src/main/index.ts`。先用 `tests/window-actions.test.ts` 验证布局、跨屏、恢复、失效目标，再实现 macOS AX/Windows Win32；真机独立窗口 smoke 校验实际坐标。
- [x] 截图：新增 `src/shared/capture.ts`、`src/main/screen-capture.ts`、`src/renderer/Capture.tsx`。测试混合 DPI、取消、超限、显示器改变；全屏快照完成后才展示 overlay，输出复用 `LaunchInputs`。
- [x] 贴图：新增 `src/main/desktop-tools.ts`、`src/renderer/ImageTools.tsx`，隔离窗口权限与输入；验证缩放、旋转后复制/保存、送回搜索、关闭释放。
- [x] 离线 OCR：安装 Tesseract.js，新增 `src/main/ocr.ts`、`src/renderer/ImageTools.tsx`，添加固定版本/校验和中英文模型到 `assets/vendor/ocr`。模型仅构建准备时下载，运行时只读本地；测试取消、超时、无文字及直接复制竞争，真实中英文图片识别。
- [x] 入口整合：共享命令元信息、主执行器、输入来源、renderer 路由与样式，接入快捷键/超级面板/图片匹配，能力禁用一致。源文件按最新内容逐点修改，不覆盖并行 SDK 工作。
- [x] 验证及对比：运行 focused tests、typecheck、build、Electron E2E 与原生 smoke，更新 `docs/validation/window-capture-ocr-2026-10-13.md`，区分实现/自动化/真机/差距，完成后勾选本计划。

命令：`npm test -- tests/window-actions.test.ts tests/capture.test.ts tests/ocr.test.ts`、`npm run typecheck`、`npm run build`、`npx playwright test tests/window-capture-ocr.spec.ts`、`git diff --check`。Node 使用 24.19.0。build 生成 dist；依赖安装修改 package-lock 并联网；OCR 模型准备下载公开模型并校验。测试仅用隔离 userData 与测试图片；系统剪贴板 smoke 在测试后有条件恢复。构建打包仅本地产物，不发布。

风险：屏幕录制/辅助功能未授予时只能验证提示，不能冒充真机通过；窗口程序可能限制最小尺寸；Linux portal 源受系统选择器约束；OCR 包体与首次初始化成本要测量。回滚按 spec，禁止覆盖其他会话改动。
