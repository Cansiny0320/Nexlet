# OCR 插件化实施计划

依据：[已批准设计](../specs/2026-10-16-optional-ocr-plugin.md)。在当前会话执行，保留工作区已有打包优化。

- [x] 插件基础合同：`src/shared/plugin-api.ts`、`plugin-validation.ts`、`src/main/plugin-bundle.ts`、`plugin-runtime.ts`、`marketplace.ts` 增加计算权限、统一容量限制与受限资源加载；先写路径/CSP/配额边界回归。
- [x] 通用交互和迁移：`plugins.ts`、`plugin-sdk/system.ts`、`command-registry.ts`、preload、`sdk/` 增加返回搜索、绑定会话的剪贴板条件写入，以及旧命令偏好映射；测试权限、重放、关闭、配置冲突与幂等性。
- [x] 独立插件：`plugins/ocr/`、`scripts/package-ocr.mjs` 构建本地 `.nexlet`，迁移原模型与许可，锁定独立依赖；实现离线 worker、三种界面语言、图片输入、截图、识别/复制/搜索、取消和错误处理。模型损坏时明确失败。
- [x] 宿主精简：`desktop-tools.ts`、`index.ts`、`ImageTools.tsx`、`Capture.tsx`、`scripts/build.mjs`、`vite.config.ts`、根依赖移除 OCR 专用路径和 FFmpeg 默认运行时，更新 SDK 文档、相应测试和 CI 插件构建步骤。
- [x] 验证：先运行相关 Vitest，再 `npm run typecheck`、`npm test`、`npm run build`、`npm run package:ocr`。使用隔离 userData 运行插件安装/识别/取消/权限/卸载及既有截图贴图 E2E；构建 Windows 安装版/便携版，核对 ASAR 清单、语言资源、差分压缩、metadata 校验和实际体积，运行 packaged/portable smoke 与插件包加载。

验证命令会生成 `dist/`、`release/`、`.tmp/` 和测试结果；依赖准备访问 npm，但插件运行测试禁止外网。屏幕和剪贴板 E2E 使用临时数据并恢复剪贴板。主要风险是 WASM/动态代码 CSP、Worker 自定义协议、生命周期取消、插件体积限制和已有快捷键；回滚见 spec。macOS/Linux 产物只能报告实际验证的范围。

执行结果及平台边界见 [验证记录](../../validation/optional-ocr-2026-10-16.md)。已批准内容完成，本地未提交或发布。
