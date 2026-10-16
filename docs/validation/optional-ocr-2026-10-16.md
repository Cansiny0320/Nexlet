# OCR 独立插件与包体积验证（2026-10-16）

基于 `954565a` 的本地工作区，保留前一阶段 Source map、前端依赖、语言资源和 Windows 差分压缩优化。本次移除 `ffmpeg-static`，将 OCR 界面、引擎、模型及 WASM 迁入 `plugins/ocr/`。尚未 commit、上传、发布或替换用户已安装应用，版本号仍为开发中的 0.2.29。

## 结果

| 产物 | 原正式包 | 上一步优化包 | 本次 |
| --- | ---: | ---: | ---: |
| Windows 安装版 | 155.3 MiB | 159.6 MiB | 107.5 MiB |
| Windows 便携版 | 155.0 MiB | 144.7 MiB | 96.5 MiB |
| 解压目录 | 591.3 MiB | 495.7 MiB | 352.5 MiB |

OCR 独立插件为 40.5 MiB，解压后 85.2 MiB，不包含在宿主安装包内。模型 SHA-256 与迁移前的固定清单一致。插件引擎的 Worker 内嵌 ONNX Runtime 1.24.3，配套固定该版本的 JSEP WASM；未沿用宿主原先的 1.30.0 WASM。

宿主 ASAR 为 7,804,583 字节，未发现 Source map、`ffmpeg-static`、PaddleOCR、ONNX Runtime、OCR 模型或原 OCR renderer/runtime。Electron 自身的 `ffmpeg.dll` 编解码库保留，不属于移除的 FFmpeg 命令行工具。语言包仅有 `en-US.pak`、`zh-CN.pak`、`zh-TW.pak`。

安装版内部压缩为 `LZMA2:20 LZMA:20 BCJ2`，`Solid = -`，145 个压缩块。`latest.yml` 的大小和 SHA-512 与实际安装包一致，blockmap 可正常解压读取。安装包解出的 ASAR 与测试使用的 `win-unpacked` ASAR SHA-256 相同。未执行真实跨版本自动更新，不能据此声称某个具体增量下载比例。

## 验证

- `npm run typecheck`、`npm run typecheck:ocr`：通过。
- `npm test`：455 passed、4 skipped；包含迁移、插件容量、计算权限、FFmpeg 显式路径与权限、剪贴板 token、识别取消/超时等回归。
- 一次与打包并行的全量测试中，未修改的 `content-matcher.test.ts`「恶意正则不会阻塞普通搜索，后续正常规则继续生效」未匹配到 `good`；停止并行打包后全量复跑通过。未修改该模块或放宽测试。
- `npm run build`、`npm run package:ocr`、`node scripts/package-windows.mjs --output .tmp/package-optional-ocr`：通过。
- 源码 Electron 集成：19 passed、1 skipped；含插件 SDK、OCR、截图贴图和语言切换。
- 设置 `NEXLET_E2E_EXECUTABLE` 为 `.tmp/package-optional-ocr/win-unpacked/Nexlet.exe`，运行 `ocr-quality.spec.ts`、`window-capture-ocr.spec.ts`、`i18n.spec.ts`：19 passed、1 skipped。
- 打包后实际安装 `.nexlet`，识别设置页、市场、文件搜索和 JSON 对比四张截图；验证编辑、旋转、返回搜索、取消、自动复制、剪贴板变化保护、文件大小边界、损坏图片、缺失模型、功能禁用、替换安装、卸载保留偏好。
- 计算权限下验证 Node、宿主 desktop API、任意文件、外网及未授权 SDK 均不可访问。截图用固定图像替代真实桌面源，检查选区、取消和识别复制；未读取私人屏幕内容。
- 从安装包解出的真实应用运行 `smoke-package.mjs`：原生桥接、后台剪贴板采集、计算和内置 Everything 搜索实际 fixture 通过。
- 真实便携版运行 `smoke-portable.mjs`：启动、原生桥接和计算通过。两个非测试模式 smoke 均报告 `Alt+Space` 已被其他应用占用，因此本次未确认该快捷键成功注册。
- `git diff --check`：通过。

运行检查使用独立临时 userData。macOS 屏幕权限测试在 Windows 跳过；macOS/Linux 未实机打包或运行验证。CI 配置已加入独立 OCR 预览附件构建，但本次未推送或运行远端 CI。

## 本地产物和校验

- `.tmp/package-optional-ocr/Nexlet-0.2.29-Windows-x64-Setup.exe`
- `.tmp/package-optional-ocr/Nexlet-0.2.29-Windows-x64.exe`
- `release/nexlet-ocr.nexlet`
- `.tmp/package-optional-ocr/audit.json`：大小、压缩方式、目录检查及哈希证据。
- `.tmp/ocr-plugin-validation/plugin.png`：已检查插件界面，无遮挡或溢出。

```json
{
  "installerSha256": "ac09055415aa08f093863715973969ad87e24e4f81853bcbd6193aa0c0e88d49",
  "portableSha256": "5f94a946b07ca2b145ba9733bacac4d11e854403c8374d7e208a2c8cd9fd2004",
  "asarSha256": "390ea9066dd49e73266a3ddb1f2a1b3913cd17713e8393955a8fad1662d0fdb8",
  "ocrSha256": "6ac6c2db52670490ca9b6b2490d1a4a11b25b89b1e82e2d96684ca005725561f"
}
```
