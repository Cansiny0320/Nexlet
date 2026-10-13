# PaddleOCR 实施计划

依据：已批准的 [spec](../specs/2026-10-13-paddle-ocr.md)。

- [x] 固定 SDK、下载并验证官方 PP-OCRv6 small 模型；更新 `assets/vendor/ocr/manifest.json`、license 和 `scripts/verify-ocr-assets.mjs`，移除旧 Tesseract 资源。
- [x] 在 `src/main/ocr.ts` / `ocr-runtime.ts`、`src/preload/ocr.ts` 与 `src/renderer/ocr.ts` / `ocr.html` 实现隔离识别、受限本地协议与生命周期；保留 DesktopTools 交互合同。
- [x] 更新 `scripts/build.mjs`、`vite.config.ts`、`package.json` 和主进程初始化，使 SDK、WASM 和模型可离线打包；更新 OCR 引擎标识。
- [x] 先补充模型、取消、协议边界等有效回归测试，再执行 `npm run typecheck`、`npm test`、`npm run build`、`playwright test tests/window-capture-ocr.spec.ts`、`git diff --check`。
- [x] 多张真实截图进行质量核对与耗时记录，保存去隐私验证报告到 `docs/validation/paddle-ocr-2026-10-13.md`。
- [x] 固定源码快照，执行本机签名打包脚本；包内 OCR E2E 与本地模型验证通过后，备份旧应用和用户数据，安装并启动回读。

风险：首次加载模型耗时、模型/WASM 增加包体积、不同平台 WASM 性能差异；通过冷启动实测和包内 OCR 验证。回滚：保留本次前应用及用户数据备份；仅回退本次 OCR 文件与依赖，不覆盖其他并行改动。安装由已有用户请求授权。

当前进度：签名包、包内 14 项验证、旧应用和用户数据备份、安装后签名及文件回读均已完成；解锁后已启动已安装应用，并在实际 OCR 界面重新验证用户付款截图成功。
