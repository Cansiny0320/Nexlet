# 离线 OCR 插件

独立的 `org.nexlet.ocr` 插件，提供图片识别、识别复制、截图识别、截图识别复制。安装后完全离线运行，不自动安装到宿主，不随宿主安装包分发。

在仓库根目录构建：

```powershell
npm ci
npm ci --prefix plugins/ocr --ignore-scripts
npm run typecheck:ocr
npm run package:ocr
```

在 Nexlet 的插件页选择「安装插件」，打开 `release/nexlet-ocr.nexlet`。需要 Nexlet 0.2.30 或更新版本；旧版不支持 `runtime.compute` 权限。

图片可以从启动器带入，也可以选择、拖入或粘贴。结果可编辑、复制及返回搜索；取消会终止识别 Worker，60 秒超时也会终止。识别复制会先记录剪贴板版本，若识别期间剪贴板改变，则保留结果供手动复制。

权限为 `runtime.compute`、`screen`、`windows`、`clipboard.read`、`clipboard.write`。没有 `files`、`process`、`backend` 或 `network.request` 权限。动态代码、WASM 和 Worker 限于插件沙箱；模型、脚本与运行时均随插件提供。

引擎为 `@paddleocr/paddleocr-js@0.4.2`，其预构建 Worker 内嵌 ONNX Runtime 1.24.3，因此插件固定携带对应版本的 JSEP WASM。模型来源、哈希和许可证见 `models/`。构建先校验模型，不在运行时下载模型。

CI 仅产出独立的 OCR 预览附件，未接入插件市场发布。旧 OCR 的快捷键、别名、禁用状态及固定入口会迁移到插件命令；卸载不会删除这些功能偏好。
