# Nexlet 官网设计

批准日期：2026-10-12。用户确认本会话提出的中文静态多页官网设计。

## 范围与结构

官网源码、资源、维护记录和检查均在 `website/`。不修改桌面程序、根依赖、根 README 或发布 CI。官网由 GPT Sites 公开托管，源码保留在公开的主仓库 Cansiny0320/Nexlet；使用仓库外临时目录同步 Sites 所需的源仓库，不创建 worktree 或嵌套 .git。

- `/`：真实图标、截图，介绍应用搜索、剪贴板、计算稿纸、JSON、编码、时间戳、UUID、网页快开，以及 FAQ。
- `/download/`：预览状态、真实 Releases 与构建记录、快捷键、系统和签名限制。
- `/privacy/`：本地数据、保留规则、备份、插件权限；区分桌面应用与官网托管。
- `/plugins/`：自有 Plugin API v1、权限和开发入口；未核实的市场能力不宣传。

浅灰底、白色面板、紫色强调色，真实截图体现紧凑桌面工具。手机与桌面布局均可用。主要内容和导航在关闭 JavaScript 时仍可读取。无账户、表单、分析脚本或远程字体。

## 事实与可发现性

从当前代码、SDK、真实截图和 Release 状态核实文案。公开源码不等于开源许可证；不称开源，不编造价格、评分、用户数、性能或发布版本。Windows 已有本机验证；macOS 构建和 smoke 与真机使用验证分别描述。发布前再次核实动态事实。

每页独立 title、description、canonical、Open Graph；站点 robots.txt、sitemap.xml；真实 SoftwareApplication/WebSite/WebPage 结构化数据与正文一致。FAQ 用可见的问答正文，不宣称 Google FAQ 富结果资格。GEO 使用清楚的事实、稳定页面与来源链接；不承诺排名或收录。参考：https://developers.google.com/search/docs/appearance/ai-features 。

## 验收与发布

检查桌面/手机、键盘焦点、菜单和内部链接、资源加载、无 JavaScript 正文、唯一标题/描述/canonical、JSON-LD 和 sitemap。仅提交本会话的 website 文件。核实主仓库及 Sites 源码与发布产物对应，公开部署成功后匿名读取所有页面、robots 和 sitemap。

## 风险与回滚

产品仍为预览，正文必须保留签名、权限和验证限制。Sites 可能添加抓取限制或认证层，以匿名 HTTP 回读为准。若发布失败保留源文件与版本，不重复创建 Site。回滚可恢复先前 Sites 版本；需要恢复源码时仅 revert 官网提交，不影响共享目录中的桌面改动。
