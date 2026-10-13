# PaddleOCR 替换验证（2026-10-13）

已采用 `@paddleocr/paddleocr-js@0.4.2` + `PP-OCRv6_small_det` / `PP-OCRv6_small_rec`，替换 Tesseract。推理使用 `onnxruntime-web@1.30.0` 单线程 WASM；模型与运行时随包分发，私有 renderer 禁止联网，图片在本机处理。

## 真实截图质量

在本机 macOS arm64 执行。每张图新建识别进程，耗时包含进程创建及模型初始化；系统文件缓存未清空，不代表首次开机冷缓存。样本包括用户提供的付款截图，以及仓库已有的真实应用界面截图。付款样本是从用户附件中裁出的可见原图区域（381 × 850），不是未压缩的原始手机截图；私密原图与输出只留在本地 `.tmp`，未加入文档或测试目录。

| 样本 | 预选文字核对 | 耗时 | 观察 |
| --- | --- | --- | --- |
| 付款截图，小字与灰色标签 | 6 / 6 | 1.96 秒 | 金额、两组完整日期时间、收款标题和标签正确；顶部图标仍可能识别成符号 |
| 深色设置页，800 × 600 | 20 / 20 | 3.43 秒 | 中文说明、快捷键、灰色小字正确；齿轮等图标有额外输出 |
| 插件市场，1600 × 1320 | 17 / 17 | 5.42 秒 | 多栏中文长句、版本号和系统名称正确 |
| 文件搜索，800 × 600 | 7 / 8 | 2.37 秒 | 文件名、日期、大小正确；约 10 像素路径中的“索引范围”仍有错字 |
| 翻译页，中英混排 | 20 / 20 | 3.81 秒 | 中英文正文和控件文字正确 |
| JSON 对比页，1600 × 1320 | 22 / 22 | 5.77 秒 | 字段和值正确；括号、行号及双栏阅读顺序不能用于原样还原代码 |

合计 92 / 93 处预先人工抄录的关键文字命中。核对仅统一 Unicode NFKC 和空白，不等同于全文字符准确率。设置页一处分号在人工抄录时写成逗号，已按截图与 `Settings.tsx` 原文校正；文件路径的已知错误保留在结果中。没有把图标符号、代码结构等误识别算成全部正确。

原 Tesseract 默认配置对同一付款裁图的六处关键文字命中 3 / 6，漏掉两项时间标签，且收款日期出现字符错误；本次变为 6 / 6。此前 Tesseract 测试只计识别阶段耗时，本次计入进程与模型初始化，两组时间不直接比较。

## 实现与隔离

- 独立隐藏 sandbox renderer，`contextIsolation=true`、`nodeIntegration=false`；主窗口不加载 OCR SDK。
- 私有 `nexlet-ocr` 协议仅返回本地打包资源和两个固定模型；外网与任意文件请求被拒绝，宿主 API 不暴露给识别页。
- OpenCV 的 Emscripten 绑定需要动态函数生成，因此仅识别页允许 `unsafe-eval`；主 UI 的 CSP 保持原样。
- 保留取消、60 秒超时、关闭销毁、旧结果丢弃、空识别、编辑结果、直接复制及剪贴板冲突保护。六张图跑完后识别窗口和临时 IPC listener 数量均为 0。
- 模型 SHA-256 由 `scripts/verify-ocr-assets.mjs` 在构建时验证；普通构建不下载模型。旧 Tesseract 依赖、worker 和语言包已移除。

## 验证

- `npm test`：58 个测试文件、432 个测试通过。
- `npm run typecheck`、`npm run build`、`git diff --check` 通过。
- `tests/window-capture-ocr.spec.ts`：9 项通过，含前轮录屏权限引导、完整 hover 提示以及 OCR 复制、编辑、取消和关闭回归。
- `tests/ocr-quality.spec.ts`：5 项通过，覆盖四张真实界面截图，以及网络/文件隔离、宿主 API 隔离和伪造结果拒绝。
- macOS arm64 本机签名包：相同证书 `69397314808BC8B95C8B4AF0FBDFA53C0184FC2C`；`codesign --verify --deep --strict` 和 DMG 校验通过。
- 签名包内 `window-capture-ocr` + `ocr-quality`：14 项通过（43.0 秒）。已安装到 `/Applications/Nexlet.app`，安装后签名与 ASAR SHA-256 均通过。旧应用及用户数据备份在 `.tmp/paddle-ocr-install-20261013-180747/backup`。安装后已通过桌面操作启动 `/Applications/Nexlet.app`，OCR 页显示 `PP-OCRv6 · 离线识别`；重新选择用户付款截图，实际界面显示识别完成，金额、标签与两组完整时间均正确。

提交范围另以独立源码快照复核，排除了其他会话尚未提交的窗口拖动改动：57 个测试文件、429 个单元测试，以及功能入口、超级面板、窗口行为和截图 / OCR 共 33 项桌面回归通过；类型检查、构建与差异空白检查通过。前述 432 项是安装阶段整个工作区的测试计数。

Windows / Linux 未进行本次实机验证；以上结果仅代表当前样本和本机。

## 来源

- [PaddleOCR.js 官方源码](https://github.com/PaddlePaddle/PaddleOCR/tree/main/paddleocr-js)
- 模型官方下载地址、大小和校验值见 `assets/vendor/ocr/manifest.json`；SDK 与运行时版本由 `package-lock.json` 固定。
