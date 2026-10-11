# Nexlet 官网

公开官网：<https://nexlet.cansiny0320.chatgpt.site>

源码属于主仓库的 `website/`。静态内容在 `src/pages.mjs`，样式和截图在 `assets/`，`scripts/build.mjs` 生成可直接托管的 `dist/`。无需新增 npm 依赖。网站不调用桌面 IPC，不包含账号、表单、分析脚本或浏览器存储。

```powershell
node website/scripts/build.mjs
node website/scripts/check.mjs
node website/scripts/serve.mjs
```

`build` 写入 website/dist；`check` 只读；`serve` 在 127.0.0.1:4173 提供本地预览，不发送外部请求。检查需先有 `assets/social.png`。浏览器验收记录见 `docs/validation.md`。

## 内容维护

- `site.json` 保存正式 origin、源码仓库和事实核对日期；域名变化时同步生成 canonical、OG 与 sitemap。
- 首页、下载、隐私、插件四页均为完整 HTML。菜单 JavaScript 仅增强移动端交互，禁用脚本仍可导航和读取内容。
- 发布状态在首页 FAQ、下载页、页脚和相关文案中保持一致。公开 Release、签名、公证、macOS 真机结果、市场等动态事实，发布前从真实来源核实。
- 不把公开仓库称为开源，除非项目已明确授予开源许可证。不编造评分、价格、用户数或下载地址。
- 结构化数据只描述真实产品，不以伪造评分满足搜索富结果字段。FAQ 保留为正文，不承诺 FAQ 富结果。搜索或 AI 收录不是部署验收条件，也无法保证。

截图来自主仓库 `docs/screenshots/` 的实际 Windows 预览版界面；图标来自 `assets/icon.png`。分享图是官网排版与实际软件截图的组合，不代表新的软件 UI。

## Sites 发布

`.openai/hosting.json` 保存已注册 Site 的 ID，不能重新创建。`.gitignore` 显式保留生成的 dist，避免根仓库忽略构建目录的规则漏掉官网。

1. 只提交官网范围文件，推送主仓库；不得暂存其他会话的桌面改动。
2. 从该提交导出 `website/` 到主仓库外的独立临时发布目录。不得在 website 建嵌套 .git，也不得改主仓库 origin。
3. 使用 Sites 的短期 source credential 和官方 `site-workflow.mjs` 同步、提交、推送与打包。凭据只通过隐藏 stdin，不写文件或日志。Windows helper 需要 Git Bash；优先将 `D:/software/Git/bin` 放在该进程 PATH 前部。
4. 在 Sites 使用用户授权的 public audience，保存并部署 helper 返回的精确 commit 与 archive。确认 succeeded，再匿名读取四页、robots、sitemap 和资源，核实没有认证跳转或 noindex。

主仓库官网提交 SHA 与 Sites 同步仓库 SHA 不相同，但网站文件应完全一致。发布记录应写出二者，不混称同一个提交。源码回滚仅针对官网提交；已有线上版本可在 Sites 回滚。
