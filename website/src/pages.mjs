export const faq = [
  ['Nexlet 是什么？', 'Nexlet 是面向 Windows 和 macOS 的桌面工具箱，把应用与快捷方式搜索、剪贴板历史、计算稿纸和常用开发工具放在一个可用快捷键唤起的窗口中。目前处于预览阶段。'],
  ['现在可以下载正式版吗？', '目前尚无公开稳定 Release。请在下载与入门页面查看真实的 GitHub Releases 和构建入口；Actions 测试构建不代表正式发布。'],
  ['需要账号或网络吗？', '使用本地搜索、剪贴板、计算稿纸和内置文本工具不需要注册账号。打开网页和访问在线分发资源需要网络；桌面应用目前没有账号或云同步功能。'],
  ['可以直接安装 uTools 插件吗？', '不可以。Nexlet 使用自己的 Plugin API v1；操作习惯相近不代表插件 API 兼容。请使用为 Nexlet 编写的插件。'],
  ['为什么快捷键或自动回贴有时不可用？', '默认 Alt+Space 可能被其他应用占用，可在设置中修改。自动回贴依赖目标窗口与系统权限，macOS 需要辅助功能授权；无法自动回贴时可以复制后手动粘贴。']
];

const shot = (file, alt, cls = '', width = 800, height = 600) => `<figure class="product-shot ${cls}"><img src="/assets/${file}.png" alt="${alt}" width="${width}" height="${height}" loading="lazy"><figcaption>Nexlet Windows 预览版 · 实际界面</figcaption></figure>`;
const arrow = '<span aria-hidden="true">↗</span>';
export const pages = [
  {
    path: '/', title: 'Nexlet — Windows 与 macOS 桌面工具箱',
    description: 'Nexlet 将应用搜索、剪贴板历史、计算稿纸、JSON 和常用开发工具收进一个桌面窗口。了解实际功能、预览版本、数据隐私与插件开发。',
    body: `<section class="hero wrap" aria-labelledby="hero-title">
      <div class="hero-copy"><p class="eyebrow"><span class="status-dot"></span> NEXLET · 桌面工具箱</p><h1 id="hero-title">常用工具，<br><span>随叫随到。</span></h1>
      <p class="hero-description">找应用，接着算，再贴回去。<br>把手边的小事，留在一个顺手的窗口里。</p>
      <div class="actions"><a class="button primary" href="/download/">了解预览版 <span aria-hidden="true">↓</span></a><a class="button secondary" href="#workflow">看看怎么用 <span aria-hidden="true">→</span></a></div>
      <p class="hero-note">面向 Windows 与 macOS <span>·</span> 当前为预览阶段</p></div>
      <div class="hero-visual"><div class="visual-topline"><span>你的下一步，从这里开始</span><span class="key-pair"><kbd>Alt</kbd><span>+</span><kbd>Space</kbd></span></div>
      <figure class="launcher-shot"><img src="/assets/launcher.png" alt="Nexlet 启动器：上方搜索框，下方固定剪贴板、计算稿纸、JSON 等工具" width="800" height="305" fetchpriority="high"><figcaption>真实应用截图 · 默认快捷键可在设置中修改</figcaption></figure>
      <div class="visual-bottom"><span><span class="tiny-icon">⌕</span> 中文 / 拼音搜索</span><span><span class="tiny-icon">↵</span> 键盘打开</span><span><span class="tiny-icon">⌘</span> 常用工具固定</span></div></div>
    </section>
    <div class="intro-strip wrap"><p><strong>少一点来回切换。</strong> 从启动应用到处理一段文本，Nexlet 把常用操作放在一起。</p><a href="/download/#first-start">从第一次唤起开始 <span aria-hidden="true">→</span></a></div>
    <section class="wrap section" id="workflow" aria-labelledby="workflow-title"><div class="section-heading"><p class="eyebrow">日常工作，接得上</p><h2 id="workflow-title">从找得到，到用得顺。</h2><p>搜索、复制、计算。熟悉的小动作，有了一个共同入口。</p></div>
      <div class="workflow-row search-row"><div class="feature-copy"><span class="section-number">01 / 找到</span><h3>想打开什么，<br>直接输入。</h3><p>搜索本机应用和快捷方式，支持中文、拼音与首字母。把常用项目固定在首页，或用方向键选择后按 Enter 打开。</p><ul class="plain-list"><li>Windows 开始菜单与桌面快捷方式</li><li>macOS Applications 中的应用</li><li>自定义搜索目录与网页快开</li></ul></div>${shot('search','输入回贴验证关键词后，启动器显示匹配的测试快捷方式与剪贴板搜索入口','',800,305)}</div>
      <div class="workflow-row reverse"><div class="feature-copy"><span class="section-number">02 / 接着用</span><h3>刚刚复制的，<br>还在手边。</h3><p>文本、图片和文件记录，按类型查找、收藏、复制。多段文本可以合并，常用内容可以放进悬浮中转窗口。</p><p class="fine-print">自动回贴需要目标窗口与系统权限配合；文件历史保存路径，原文件仍需存在。</p><a class="text-link" href="/privacy/#clipboard">了解记录与保留规则 →</a></div>${shot('clipboard','剪贴板历史按全部、文本、图像、文件和收藏分类，列表显示测试文本与文件')}</div>
      <div class="workflow-row"><div class="feature-copy"><span class="section-number">03 / 想清楚</span><h3>算到哪，<br>思路就留在哪。</h3><p>逐行计算，按 Enter 接着算。给数字加上备注，为不同事情新建稿纸，结果和过程一起自动保存在本机。</p><div class="calculation"><span>128 × 3</span><span>384</span><i aria-hidden="true">↓</i><span>384 + 256</span><strong>640</strong></div><p class="fine-print">支持括号、幂、百分比及常见函数。百分号表示除以 100，三角函数使用弧度。</p></div>${shot('scratchpad','计算稿纸显示 128 乘 3 等于 384，再加 256 等于 640，并保留后续费用备注')}</div>
    </section>
    <section class="tools-section" aria-labelledby="tools-title"><div class="wrap"><div class="section-heading split-heading"><div><p class="eyebrow">小工具，也有固定位置</p><h2 id="tools-title">处理一下，继续手上的事。</h2></div><p>在本机完成常见文本转换，<br>从启动器搜索工具名称即可进入。</p></div><div class="tool-grid">
      <article class="tool-item"><span class="tool-symbol green" aria-hidden="true">{ }</span><h3>JSON</h3><p>格式化、压缩与校验，让结构更好读。</p></article>
      <article class="tool-item"><span class="tool-symbol blue" aria-hidden="true">&lt;/&gt;</span><h3>编码转换</h3><p>URL 与 Base64 编解码，支持 UTF-8 文本。</p></article>
      <article class="tool-item"><span class="tool-symbol coral" aria-hidden="true">◷</span><h3>时间戳</h3><p>Unix 秒 / 毫秒与日期互转，查看本地时间和 UTC。</p></article>
      <article class="tool-item"><span class="tool-symbol purple" aria-hidden="true">#</span><h3>UUID</h3><p>生成 UUID v4，单个或批量复制。</p></article>
    </div></div></section>
    <section class="wrap section trust-section" aria-labelledby="local-title"><div><p class="eyebrow">在自己的桌面上</p><h2 id="local-title">数据在本机，<br>工具按需扩展。</h2><p>剪贴板、稿纸和配置保存在本地。<br>需要更多工具时，用 Nexlet 插件补上。</p></div><div class="trust-links"><a href="/privacy/"><span class="link-number">01</span><div><h3>了解数据与隐私</h3><p>存在哪里、保留多久、如何备份。</p></div><span aria-hidden="true">↗</span></a><a href="/plugins/"><span class="link-number">02</span><div><h3>为 Nexlet 写一个插件</h3><p>使用 HTML、CSS、JavaScript 和明确授权的 API。</p></div><span aria-hidden="true">↗</span></a></div></section>
    <section class="wrap section faq-section" aria-labelledby="faq-title"><div class="section-heading"><p class="eyebrow">开始之前</p><h2 id="faq-title">你可能想问。</h2></div><div class="faq-list">${faq.map(([q,a],i)=>`<details${i===0?' open':''}><summary>${q}</summary><p>${a}</p></details>`).join('')}</div></section>
    <section class="wrap closing"><div><p class="eyebrow">给常用操作，一个入口</p><h2>让下一步，顺手一点。</h2></div><a class="button primary" href="/download/">查看预览与安装说明 <span aria-hidden="true">→</span></a></section>`
  },
  {
    path:'/download/',title:'下载与入门 — Nexlet 预览版及系统说明',description:'查看 Nexlet 真实发布与构建入口、首次使用方式，以及 Windows 签名、macOS 公证和自动回贴权限的当前限制。',
    body:`<div class="wrap document"><header class="document-header"><p class="eyebrow">下载与入门</p><h1>先了解，再开始。</h1><p>Nexlet 正在预览阶段。这里区分已发布版本、测试构建与实际验证范围。</p></header>
    <section class="release-banner" aria-labelledby="release-title"><div><span class="badge">预览阶段</span><h2 id="release-title">公开稳定版本尚未发布</h2><p>可用的正式发布记录以 GitHub Releases 为准。测试构建位于 GitHub Actions，不等同于稳定版本。</p></div><div class="actions"><a class="button primary" href="https://github.com/Cansiny0320/Nexlet/releases">查看 Releases ${arrow}</a><a class="text-link" href="https://github.com/Cansiny0320/Nexlet/actions/workflows/release.yml">查看构建记录 ${arrow}</a></div></section>
    <section class="document-section" id="platforms"><h2>平台与验证范围</h2><div class="table-scroll" tabindex="0" role="region" aria-label="平台与验证范围表格"><table><thead><tr><th scope="col">平台</th><th scope="col">当前状态</th><th scope="col">使用前了解</th></tr></thead><tbody><tr><th scope="row">Windows x64</th><td>已完成本机运行、打包和原生回贴验证。</td><td>当前程序未做数字签名。具体版本和文件以发布记录为准。</td></tr><tr><th scope="row">macOS Intel / Apple Silicon</th><td>已配置两种架构的原生 CI 构建与启动检查，结果以对应构建记录为准。</td><td>CI 使用 ad-hoc 签名，未做 Developer ID 签名或 Apple 公证；自动回贴需要辅助功能授权，仍需真机使用验收。</td></tr><tr><th scope="row">Linux</th><td>目前不提供发行包。</td><td>文件剪贴板与自动回贴尚未实现。</td></tr></tbody></table></div><p class="note">目前没有经过完整验证的最低操作系统版本清单。构建通过或成功启动，不代表所有系统版本和桌面场景均已验证。</p></section>
    <section class="document-section" id="first-start"><h2>第一次使用</h2><ol class="steps"><li><h3>查看版本与来源</h3><p>先阅读对应 Release 的安装说明、平台和校验信息。预览期间，开发者也可以从主仓库源码构建；Actions artifacts 可能需要登录 GitHub，且会过期。</p></li><li><h3>用快捷键唤起</h3><p>默认按 <kbd>Alt</kbd> + <kbd>Space</kbd>。如果已被其他应用占用，在 Nexlet 设置中改为 <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>Space</kbd> 或其他可用组合。</p></li><li><h3>搜索并固定常用工具</h3><p>输入应用名称、拼音或工具关键词。用方向键选择，按 Enter 打开；右键可以把常用项目固定到首页。</p></li><li><h3>按需启用剪贴板与回贴</h3><p>在设置中管理记录开关和保留范围。macOS 自动回贴需要在系统设置中授予辅助功能权限；无法回贴时可以手动粘贴。</p></li></ol></section>
    <section class="document-section"><h2>遇到问题</h2><p>关闭主窗口后，应用会保留在托盘中；需要完全退出时使用托盘菜单。反馈问题时请附上系统、版本和复现步骤，避免提交剪贴板或稿纸中的私人内容。</p><div class="actions"><a class="button secondary" href="https://github.com/Cansiny0320/Nexlet/issues">反馈问题 ${arrow}</a><a class="text-link" href="https://github.com/Cansiny0320/Nexlet">查看源码与构建说明 ${arrow}</a></div></section><p class="review-date">页面事实核对：2026-10-12 · 发布状态以 GitHub 的当前记录为准。</p></div>`
  },
  {
    path:'/privacy/',title:'数据与隐私 — Nexlet 本地存储和剪贴板规则',description:'了解 Nexlet 桌面应用如何存储剪贴板、图片、稿纸、配置与插件数据，以及记录保留、备份和官网托管的范围。',
    body:`<div class="wrap document"><header class="document-header"><p class="eyebrow">数据与隐私</p><h1>自己的数据，<br>存放在哪里。</h1><p>下面说明当前桌面实现的实际行为，以及官网与应用之间的区别。</p></header>
    <section class="document-section"><h2>桌面应用的数据保存在本机</h2><p>Nexlet 将剪贴板记录、计算稿纸、配置与插件数据保存到应用数据目录中的 SQLite 数据库，图片另存于本地目录。当前未接入账号、云同步或遥测功能，应用不自动上传这些内容。</p><p>本地存储不是加密保险箱：数据库中的文本以可读形式保存。能够访问你的系统账号或数据目录的人或程序，可能读取这些内容。</p><dl class="data-locations"><div><dt>Windows 默认目录</dt><dd><code>%APPDATA%/Nexlet</code></dd></div><div><dt>macOS 默认目录</dt><dd><code>~/Library/Application Support/Nexlet</code></dd></div></dl><p>以设置中的「打开数据目录」显示的位置为准。主要内容包括 <code>nexlet.sqlite</code>、<code>images</code> 和 <code>plugins</code>。</p></section>
    <section class="document-section" id="clipboard"><h2>剪贴板记录与保留</h2><ul class="reading-list"><li>记录开启时，应用在后台捕获支持的文本、图片和文件内容；可在设置中暂停记录。</li><li>默认保留最多 500 条非收藏记录、最长 30 天；收藏记录不参与自动清理。</li><li>暂停记录后仍可查看已有历史。删除记录与关闭记录开关是不同操作。</li><li>文件历史保存原始路径，不备份原文件。移动或删除原文件后，该记录可能无法继续使用。</li><li>请勿将剪贴板历史作为密码或其他敏感内容的安全存储方式。</li></ul></section>
    <section class="document-section"><h2>备份与删除</h2><p>备份前先从托盘菜单完全退出 Nexlet，再复制整个应用数据目录，以保持数据库与图片、插件文件一致。恢复时同样先退出应用。</p><p>剪贴板记录可以在应用中删除；稿纸也有独立删除操作。删除应用安装文件不等于删除用户数据。插件卸载默认保留独立数据，卸载时可选择同时删除。</p></section>
    <section class="document-section"><h2>插件权限有明确边界</h2><p>插件安装时会显示申请的系统能力。当前 API 包括读写当前剪贴板文本和在系统浏览器打开 HTTP / HTTPS 链接；插件的本地存储相互隔离。插件不能通过剪贴板读取 API 查询 Nexlet 历史库。</p><p>请只安装可信来源的插件，并在安装前阅读权限。已获得读取当前剪贴板文本权限的插件能够接触你复制的文本。</p><a class="text-link" href="/plugins/">查看插件权限与开发说明 →</a></section>
    <section class="document-section"><h2>访问官网时</h2><p>本官网由 GPT Sites 托管，提供公开产品资料。官网代码未添加第三方分析脚本、广告、账号、表单或浏览器持久化存储。加载官网不读取 Nexlet 桌面应用的数据。</p><p>托管服务在响应网络请求时可能处理 IP 地址、请求信息等运行数据；这与 Nexlet 桌面应用的本地存储不同。点击 GitHub 或其他外部链接后，适用对应服务的规则。</p></section><p class="review-date">依据当前实现核对：2026-10-12。<a href="https://github.com/Cansiny0320/Nexlet/tree/main/src/main">查看应用实现</a></p></div>`
  },
  {
    path:'/plugins/',title:'插件开发 — Nexlet Plugin API、权限与示例',description:'使用 HTML、CSS、JavaScript 和 Nexlet Plugin API v1 编写本地桌面插件。了解安装方式、独立存储、剪贴板权限和沙箱限制。',
    body:`<div class="wrap document"><header class="document-header"><p class="eyebrow">NEXLET PLUGIN API V1</p><h1>把你的工具，<br>接进 Nexlet。</h1><p>用熟悉的 Web 技术写界面，通过明确授权的 API 与桌面协作。</p><div class="actions"><a class="button primary" href="https://github.com/Cansiny0320/Nexlet/blob/main/docs/plugin-sdk.md">阅读完整 SDK ${arrow}</a><a class="button secondary" href="https://github.com/Cansiny0320/Nexlet/tree/main/examples/hello-nexlet">查看可运行示例 ${arrow}</a></div></header>
    <section class="document-section"><h2>一个目录，就是起点</h2><p>插件由 <code>plugin.json</code> 与本地 HTML / CSS / JavaScript 组成。开发时在插件管理中导入本地目录；分发时可打包为根目录包含 manifest 的 ZIP 或 <code>.nexlet</code> 文件。</p><div class="code-block"><pre><code>hello-nexlet/
├── plugin.json
├── index.html
└── main.js</code></pre><span>本地资源 · 独立窗口</span></div><p>Nexlet 使用自己的插件 API，不兼容 uTools 插件 API。当前已核实的安装方式为本地包与开发目录；在线市场能力以实际应用和发布说明为准。</p></section>
    <section class="document-section"><h2>只申请需要的能力</h2><div class="table-scroll" tabindex="0" role="region" aria-label="插件 API 权限表格"><table><thead><tr><th scope="col">权限</th><th scope="col">能力</th><th scope="col">边界</th></tr></thead><tbody><tr><th scope="row">无需系统权限</th><td><code>info</code>、<code>storage</code>、<code>onActivate</code></td><td>当前插件信息、独立存储和激活事件。</td></tr><tr><th scope="row"><code>clipboard.read</code></th><td>读取当前剪贴板文本。</td><td>无法读取 Nexlet 历史记录库。</td></tr><tr><th scope="row"><code>clipboard.write</code></th><td>写入系统剪贴板文本。</td><td>不等于自动向其他应用回贴。</td></tr><tr><th scope="row"><code>shell.openExternal</code></th><td>在默认浏览器打开链接。</td><td>仅允许 HTTP / HTTPS 链接。</td></tr></tbody></table></div></section>
    <section class="document-section"><h2>隔离运行，持久数据交给宿主</h2><p>插件使用独立窗口、内存 session 和 Electron sandbox，关闭 Node.js 集成，启用上下文隔离。宿主检查请求来源与安装时授予的权限；插件不能直接访问 Node.js、任意 IPC 或其他插件的存储。</p><p>当前网络连接默认禁用，请将依赖与资源随包提供。跨次运行的数据使用 <code>nexlet.storage</code> 保存，不依赖窗口的 localStorage。具体配额、路径校验与 API 行为以 SDK 文档为准。</p></section>
    <section class="document-section"><h2>从便笺示例开始</h2><ol class="steps"><li><h3>查看示例源文件</h3><p>主仓库的 <code>examples/hello-nexlet</code> 提供保存、复制文本和接收激活内容的示例。</p></li><li><h3>在插件管理中加载目录</h3><p>确认申请权限后，搜索「示例便笺」打开。修改界面文件后重新打开插件窗口；manifest 或权限变更需要重新导入。</p></li><li><h3>检查失败与卸载行为</h3><p>API 调用返回 Promise。处理拒绝与错误提示，确认停用、升级和卸载时的预期数据行为。</p></li></ol></section><p class="review-date">API 说明核对：2026-10-12 · <a href="https://github.com/Cansiny0320/Nexlet/blob/main/docs/plugin-sdk.md">SDK 为完整参考</a></p></div>`
  }
];
