# 官网发布记录

2026-10-12（Asia/Shanghai）。

- 公开网站：https://nexlet.cansiny0320.chatgpt.site
- GitHub 官网实现提交：`77caab63284f3d6041e974dcace3d85a39b4ac34`。
- Sites 源码提交：`4ccdb0060cb9a7a49c65b08ac860ebe17d685137`。
- Site ID：`appgprj_6acbbb32d78881919f324dcdf9ee6640`。
- Sites 版本：1。
- 版本 ID：`appgprj_6acbbb32d78881919f324dcdf9ee6640~appgver_45afdf3dc3288191909a21c40ef4a6d9`。
- 部署 ID：`appgdep_6acbcb216cf48191ba8dce92d68d6043`。
- 部署结果：`succeeded`，2026-10-12 01:45:21 +08:00。
- 访问范围：public，访问配置 revision 2；本次未变更已批准的公开范围。

从 GitHub 官网实现提交精确导出 website，56 个源文件逐一核对 SHA-256 后同步至既有 Sites 源仓库。使用官方 helper 推送并打包，本地 archive 文件 SHA-256 为 `d8fda4b0fdc58fa39a1c60de3d62c21d583fde5dd39aec7f75ef0a61f759923a`；Sites 返回的 `archive_storage.content_hash` 为 `sha256:4bcf489a2e8deb60928d651e616b39911d172b9e2e16cf44de103b25e4a4ffa2`。部署包含 20 个文件。主仓库与 Sites 独立源码仓库的 commit SHA 不同，部署文件源自同一批已验证内容。

公开域名上重新运行 `browser-check.cjs` 通过：四页在 1065、1107、1440、768、390、320 px 下无横向溢出或页面脚本错误；下载选择、异步识别、键盘、FAQ、复制、无 JavaScript 直接下载均通过。浏览器实际点击首页下载入口，收到安装包下载事件，文件名为 `Nexlet-0.1.0-Windows-x64.exe`；验证后取消本次重复下载。

当前公开安装包固定为 `v0.1.0` 预览版，源提交为 `6277f6782f194cd8c1b23eeaa7ae4e722f4136e0`。它与官网发布版本编号、主项目正在演进的 0.2.0 分别记录。

匿名 HTTP 回读确认四页、robots、sitemap、字体和脚本可直接访问，无认证跳转和 noindex 头。canonical 与正式 origin 一致。线上 CSS、JavaScript、平台 helper、字体、SVG 图标和分享图的字节均与部署 archive 一致。Git 的 `core.autocrlf=true` 使打包文本使用 CRLF；与工作目录文本比较时仅换行不同，避免把换行差异误报为部署内容漂移。

本文件是部署后的审计记录，不改变静态网页产物；源码提交和部署对应关系以上述两个 SHA 为准。

## 2026-10-12 细节优化更新

- GitHub 官网实现提交：`3373be2399ff2607baf022ebf3fde3b9304fd96b`。
- Sites 源码提交：`ada43456077a424f2e8c30b76e019453e169a4ef`。
- Sites 版本：2，访问范围保持 public。
- 版本 ID：`appgprj_6acbbb32d78881919f324dcdf9ee6640~appgver_1e8b7fbecf38819187151f48a13b4b8d`。
- 部署 ID：`appgdep_6acbd1b9665481918104a2697b4302b3`。
- 部署结果：`succeeded`，2026-10-12 02:13:29 +08:00。
- Sites archive content hash：`sha256:c926808805cabbdbff36f55354ed5c8453a3311fb535fcda6d8c1192fd6c43ce`，22 个部署文件。

本次细节调整见 visual-refinement.md。从实现提交精确导出的 63 个 website 源文件逐一校验后同步至 Sites；未包含共享工作区里的桌面端未提交改动。四页匿名 HTTP 回读均为 200，兼容性提示已从正式页面删除。线上 CSS、手写字体和分享图均与部署 archive 字节相同。公开域名的四页、六种屏幕宽度及交互回归检查通过。安装包版本仍为 0.1.0 预览版。

本节为部署后的记录，不改变此次已部署静态产物。
