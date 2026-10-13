# Nexlet 官网

公开官网：<https://nexlet.cansiny0320.chatgpt.site>

源码属于主仓库的 `website/`。静态内容在 `src/pages.mjs`，组件在 `src/components.mjs`，样式和资源在 `assets/`，`scripts/build.mjs` 生成可直接托管的 `dist/`。无需新增 npm 依赖。网站不调用桌面 IPC，不包含账号、表单、分析脚本或浏览器存储。

图标使用 `src/vendor/icons.json` 中的静态 SVG：通用图标来自 Lucide 0.468.0（与桌面端版本一致），品牌图标来自 Simple Icons 11.0.0。保留原始路径与 viewBox，由构建内联到页面；无需运行时依赖或 CDN。来源见 JSON 中的 `source`，许可证随 `assets/LICENSE-Lucide.txt` 与 `assets/LICENSE-SimpleIcons.txt` 分发。新增图标应从图标库导入，不手写品牌轮廓。

```powershell
node website/scripts/build.mjs
node website/scripts/check.mjs
node website/scripts/serve.mjs
```

`build` 写入 website/dist；`check` 只读；`serve` 在 127.0.0.1:4173 提供本地预览；浏览器打开首页和下载页时会请求 GitHub Release API。`node --test website/tests/*.test.mjs` 验证平台识别、Release 解析和请求失败场景；`node --test website/tests/releases.browser.mjs` 在本机 Chrome 中自动启动临时预览服务器，验证异步更新、失败回退和无 JavaScript 下载；`node website/scripts/browser-check.cjs` 使用主项目已有 Playwright 与 Microsoft Edge，写入 `.qa/` 截图和报告，不改变网页资源。浏览器验收记录见 `docs/validation.md`。

## 内容维护

- `site.json` 保存正式 origin、源码仓库和事实核对日期；域名变化时同步生成 canonical、OG 与 sitemap。
- 首页、下载、插件三页均为完整 HTML。JavaScript 增强平台选择、移动导航和复制；禁用脚本仍可导航，下载页三个平台链接直接可用。
- `downloads.json` 记录已核实的回退版本、来源提交与安装包直链。首页和下载页加载时，`assets/releases.mjs` 从 GitHub `/repos/Cansiny0320/Nexlet/releases/latest` 获取最新正式 Release（不含 draft 和 prerelease）。只有 Windows x64 便携 EXE、两种 macOS DMG 和 `SHA256SUMS.txt` 全部匹配同一版本时，才同步更新下载链接、版本、更新日志和校验文件。每页请求一次，5 秒超时，不携带认证信息，不自动重试、不使用浏览器持久存储。请求失败、限流或附件不齐时提示用户并保留整套回退链接；关闭 JavaScript 时也可下载回退版本。仅凭 macOS 的 Intel UA 无法判断硬件架构；未知平台回退到手动选择。手动选择优先于异步检测。切换平台不会立即下载，主按钮执行下载。
- 公开 Release、签名、公证、macOS 真机结果、市场等动态事实，发布前从真实来源核实。当前静态回退安装包为已核实的 0.2.5；正常联网时以 GitHub 最新正式 Release 为准。附件命名应继续遵循现有发布约定；只上传 CI artifact 或保存 draft 不会更新官网下载版本。
- 不把公开仓库称为开源，除非项目已明确授予开源许可证。不编造评分、价格、用户数或下载地址。
- 结构化数据只描述真实产品，不以伪造评分满足搜索富结果字段。FAQ 保留为正文，不承诺 FAQ 富结果。搜索或 AI 收录不是部署验收条件，也无法保证。

视觉基准为 `designs/2026-10-12-ui-v2/`，首页使用 `01-home-system-download.png`。官网产品插画由 HTML/CSS/SVG 绘制，属于功能示意，不代表桌面软件的新 UI。保留的 launcher PNG 是实际 Windows 预览截图；分享图是新官网首屏截图。

网页字体使用本地托管的 Noto Sans SC 子集，随附 OFL 许可证；不向第三方字体服务发送请求。变更文案后可用 `scripts/build-font.py` 与 `fonttools[woff]` 从原 OFL 字体重建子集，日常构建不依赖 Python。

## Sites 发布

`.openai/hosting.json` 保存已注册 Site 的 ID，不能重新创建。`.gitignore` 显式保留生成的 dist，避免根仓库忽略构建目录的规则漏掉官网。

1. 只提交官网范围文件，推送主仓库；不得暂存其他会话的桌面改动。
2. 从该提交导出 `website/` 到主仓库外的独立临时发布目录。不得在 website 建嵌套 .git，也不得改主仓库 origin。
3. 使用 Sites 的短期 source credential 和官方 `site-workflow.mjs` 同步、提交、推送与打包。凭据只通过隐藏 stdin，不写文件或日志。Windows helper 需要 Git Bash；将 `D:/software/Git/bin` 放在该进程 PATH 前部，并设置该进程的 `TAR_OPTIONS=--force-local`，避免 GNU tar 将盘符当作远端主机。
4. 在 Sites 使用用户授权的 public audience，保存并部署 helper 返回的精确 commit 与 archive。确认 succeeded，再匿名读取三页、robots、sitemap 和资源，核实没有认证跳转或 noindex。

主仓库官网提交 SHA 与 Sites 同步仓库 SHA 不相同，但网站文件应完全一致。发布记录应写出二者，不混称同一个提交。源码回滚仅针对官网提交；已有线上版本可在 Sites 回滚。
