[简体中文](plugin-sdk.md) · [繁體中文](plugin-sdk.zh-Hant.md) · [English](plugin-sdk.en.md)

# Nexlet Plugin API v1

插件由 `plugin.json` 和本地 HTML / CSS / JavaScript 组成。使用 Web 标准编写界面，通过沙箱 preload 提供的 `window.nexlet` 请求宿主能力。内置工具与外部插件使用不同的 IPC 接口。

## 扩展能力

新增独立 Node.js backend、文档数据库、窗口与搜索 UI、文件/进程、屏幕与输入、浏览器自动化、Sharp/FFmpeg、AI/MCP、账号与同步适配。具体方法、权限、运行边界与样例见 [SDK 扩展文档](plugin-sdk-extensions.md)，实测范围见 [验证记录](validation/plugin-sdk-2026-10-13.md)。扩展沿用 API v1，但尚未发布，不代表旧版宿主已经支持。

## TypeScript 开发

插件可以使用 TypeScript 编写，交付前需要编译为 JavaScript。插件仓库提供 [TS 模板](https://github.com/Cansiny0320/Nexlet-plugins/tree/main/templates/typescript) 和 [独立 API 类型包](https://github.com/Cansiny0320/Nexlet-plugins/tree/main/sdk)。在 `Nexlet-plugins` 根目录执行：

```sh
npm ci
npm run package:example
```

导入 `dist/typescript-example.nexlet`，或加载 `.build/templates/typescript` 开发目录。`npm run dev -- templates/typescript` 监听 TS 和静态资源修改；退出插件再打开读取新文件，manifest 或权限改变后需重新导入。`npm run build` 先运行 `tsc --noEmit`，再通过 esbuild 将 `src/main.ts` 打包成 `main.js`，并复制 HTML/CSS 等静态资源。`npm run package` 打包 `.build/plugins`，不会将 TS 源码或开发依赖装进插件包。

本地类型包名为 `@nexlet/plugin-api`，提供 `nexlet`、`window.nexlet` 的全局声明，以及 `PluginApi`、`PluginManifest`、`PluginContext` 等导出类型。目前未发布到 npm；独立工程可以从插件仓库的 `sdk` 目录作为本地开发依赖安装。不要使用本仓库 `src/shared/types.ts` 中的 `HostApi` 作为插件类型，该接口仅面向主程序页面。

类型声明覆盖下文已实现的 Nexlet API；TypeScript 不改变插件的权限、沙箱或运行能力。

## Manifest

```json
{
  "id": "org.nexlet.hello",
  "name": "便笺示例",
  "version": "1.0.0",
  "description": "保存并复制一段便笺",
  "apiVersion": 1,
  "main": "index.html",
  "icon": "icon.png",
  "permissions": ["clipboard.write"],
  "features": [
    {"code": "note", "name": "示例便笺", "keywords": ["hello", "便笺"]}
  ]
}
```

`id` 是插件的稳定身份，用于搜索命令、数据隔离和升级；必须使用反向域名格式，例如 `org.nexlet.hello`；每段以小写字母开头，包含小写字母、数字或连字符。`main` 必须是包内相对 HTML 路径。不要使用绝对路径、`..`、符号链接或远程入口。

ZIP 包根目录必须直接包含 `plugin.json`。可直接选择开发目录调试，退出后重新打开会读取更新后的文件；修改 manifest 或权限后需要重新导入。每个插件同一时刻只有一个会话，多条 feature 指令通过激活通知切换。

`icon` 可选，必须是包内 PNG 相对路径，不超过 512 KB，宽高不超过 2048 像素。宿主生成搜索和已安装列表中的缩略图。未提供时使用默认插件图标。

## 应用语言

`await nexlet.i18n.getLocale()` 返回 `zh-CN`、`zh-Hant` 或 `en`；`nexlet.i18n.onChange(callback)` 订阅应用语言变化并返回取消订阅函数，不需要额外权限。`system.info().locale` 仍表示系统语言。兼容旧宿主时应先检测 `i18n`；先订阅再读取，若先收到事件则忽略迟到的首次读取值。

Manifest、feature 和市场条目可选声明 `locales`，为不同语言提供 `name`、`description`，市场分类可提供 `category`。缺省回退到原字段，ID、code、版本、路径、权限与用户数据不变。示例和维护约定见 [i18n 说明](i18n.md)。

## 插件市场

公开目录位于 [Nexlet-plugins](https://github.com/Cansiny0320/Nexlet-plugins)。客户端只从该仓库的 `index.json` 读取版本化目录，从同一仓库的 GitHub Releases 下载插件包。条目包含平台和最低 Nexlet 版本，安装包 ID / 版本必须一致，不要求 Hash 字段。

Nexlet 0.2.47 的市场下载进入任务列表，支持进度、取消和重试；校验完成后选择安装。首次安装会显示声明的权限，更新新增权限或把已有本地提供商改为云端时需要确认。成功后才替换安装记录，失败保留旧版本和独立数据。开发目录不会被市场覆盖，不自动降级；离线可查看已缓存目录。

市场插件新建会话前仍检查兼容更新，索引最多 2 秒、下载最多 10 秒。没有新增权限且没有本地转云变更时才自动激活；需要确认的版本留待用户手动更新。断网、超时、校验失败或缺少当前功能时继续使用旧版。已有会话不重启；本地导入、开发目录和已停用插件不自动更新。

## API

请求方法返回 Promise，失败会 reject，应在界面显示错误；事件订阅返回取消订阅函数。

```js
const info = await nexlet.info();
// { name, version, code, payload }

const previous = await nexlet.storage.get('note'); // 没有保存时为 null
await nexlet.storage.set('note', { text: 'Hello' });

const text = await nexlet.clipboard.readText();    // clipboard.read
await nexlet.clipboard.writeText('Hello');         // clipboard.write
await nexlet.openExternal('https://example.com'); // shell.openExternal

const unsubscribe = nexlet.onActivate(({ code, payload }) => {
  // 已打开的插件再次通过某条指令被唤起。
});
// 不再需要时 unsubscribe()
```

`storage` 只访问当前插件的数据。键允许字母、数字、`_`、`.`、`-`，最长 100 个字符；值必须可通过 IPC 结构化复制及 JSON 序列化，每个插件合计不超过 1 MB。不要使用 `__proto__`、`constructor` 或 `prototype`。卸载默认保留数据，使用同一个 `id` 重新安装后可继续读取。

| 权限 | 可用能力 | 限制 |
| --- | --- | --- |
| 无权限 | `info`、`storage`、`onActivate` | 当前插件独立数据 |
| `clipboard.read` | 读取当前剪贴板文本 | 不可读取 Nexlet 历史库；返回文本最多 2 Mi 字符 |
| `clipboard.write` | 写入剪贴板文本 | 单次最多 1 Mi 字符 |
| `shell.openExternal` | 在默认浏览器打开链接 | 仅 HTTP / HTTPS；拒绝带用户名密码的 URL |

## 运行隔离

每个插件使用独立内存 session 和 sandbox，默认通过 WebContentsView 内嵌主窗口，可分离为独立窗口。`nodeIntegration` 关闭，`contextIsolation` 开启，无 `require`、`process` 或任意 IPC。宿主根据调用 webContents、主 frame、插件来源及安装时的 manifest 能力声明检查每个请求。

资源从 `nexlet-plugin://<id>/...` 读取。宿主检查资源真实路径仍在插件根目录中，拒绝越界路径。CSP 默认只允许本地脚本和样式：请用 `<script src="main.js"></script>`，不要使用内联脚本、`eval`、iframe、远程依赖、内联事件处理器或表单提交。网络连接、窗口弹出和浏览器权限请求默认禁用。

样式允许内联，图片允许包内文件及 `data:` / `blob:`。需要图标和依赖时，将它们随包提供。插件会话结束后清理浏览器 session；需要跨次运行保存的数据请使用 `nexlet.storage`，不要依赖 localStorage。

安装包限制、非法 manifest 和越界文件都会在导入时被拒绝。插件停用后移出搜索结果并结束会话。插件进程崩溃或无响应时结束该插件会话，并通知主界面。

完整可运行示例位于 `examples/hello-nexlet`；宿主实现位于 `src/main/plugins.ts`，桥接定义位于 `src/preload/plugin.ts`。


## 内容匹配与输入

feature 可选添加 `matches`，多条规则取「或」，单条文件规则中的条件取「且」。旧 manifest 无需迁移。

```json
{"code":"read","name":"读取文本","keywords":["read"],"matches":[
  {"type":"text","minLength":1,"maxLength":10000},
  {"type":"regex","pattern":"^https?://","flags":"i"},
  {"type":"files","extensions":["txt","json"],"fileType":"file","minCount":1,"maxCount":10},
  {"type":"image"}
]}
```

文件扩展名不含点且不区分大小写；`fileType` 为 `file` 或 `directory`。空文本不触发内容匹配。关键词命中优先，内容匹配随后，同 feature 去重。资源输入可继续键入关键词筛选。

每 feature 最多 10 条规则；正则模式最多 512 字符，flags 只接受 `i/m/s/u`，仅匹配长度不超过 10000 字符的输入。正则在可终止 worker 中运行，每条 20 ms、批次 200 ms，宿主另设 1 秒期限；总共最多执行 128 条正则，超限或失败在启动器显示提示，不阻塞普通搜索。

```js
const context = await nexlet.context();
// { id, code, type: 'text' | 'files' | 'image', payload, from: 'input' | 'paste' | 'drop' | 'selection' | 'capture' }
// text.payload: 完整文本；files.payload: Resource[]；image.payload: Resource
// Resource: { id, name, size, isDirectory, path?, mime? }
if (context.type === 'files' && !context.payload[0].isDirectory) {
  const bytes = await nexlet.input.read(context.payload[0].id); // Uint8Array
  const text = new TextDecoder().decode(bytes);
}
```

输入由用户键入、粘贴、拖入，或通过超级面板 / 已开启「带入当前选区」的功能快捷键获取，仅在选择功能后给选中的插件会话授予只读 token。最多 100 个文件，单文件/图片 20 MB、文件合计 64 MB、图片 3600 万像素；文本最多 50 万字符。目录只提供元信息。宿主检测文件替换和修改，不提供任意路径读取。再次进入、退出、禁用、更新、卸载或崩溃后，旧 token 失效。分离保留原 token。输入卡片本身不写系统剪贴板。`from: "selection"` 和宿主截图的 `from: "capture"` 是 SDK v1 的新增来源值，payload 与资源 token 合同不变；面板关闭不撤销已经交给插件的 token。选区获取优先使用系统原生文本读取，复制兜底会短暂写入系统剪贴板并在版本未变化时尝试恢复；选区内容只保留在内存，默认不进入 Nexlet 历史。用户明确选择「收进剪贴板」后才主动收录。

## 会话生命周期

```js
const offReady = nexlet.onReady(() => { /* 本 renderer 初始化一次 */ });
const offEnter = nexlet.onEnter(context => { /* 每次显式启动，包括首次 */ });
const offDetach = nexlet.onDetach(() => { /* 同一 renderer 已移到独立窗口 */ });
const offOut = nexlet.onOut(context => { /* 会话即将退出，可保存少量状态 */ });
```

首次顺序为 ready → enter，再次启动为旧 onActivate → enter。ready / enter 支持订阅时回放最近事件；一个订阅函数只调用一次回放。每个事件最多等待回调 250 ms，插件不应依赖 out 完成长耗时操作；崩溃时无法保证 out 回调。事件返回的函数取消订阅。

`info()` 和 `onActivate` 保留旧合同：payload 始终为字符串（最多 65536 字符，资源输入为空字符串），onActivate 仅再次激活触发。新插件使用 context/onEnter 接收完整输入，不假定 ready 时 DOM 已绘制完成。

隐藏主窗口保留会话；返回首页、切换工具、Escape 退出、禁用/更新/卸载结束会话。分离转移同一个 WebContentsView，不刷新页面，不重新 ready/enter；再次启动已分离插件聚焦它并发送新 enter。插件不得调用宿主工具的 IPC。宿主弹出对话框时暂时隐藏插件内容，避免覆盖确认界面。

## 受控网络与加密密钥（Nexlet 0.2.7+）

插件仍不能直接 `fetch`，需在 manifest 声明 `network.request`，再调用宿主桥接。已安装插件按声明直接使用联网能力，不再逐 origin 弹窗确认或记录地址授权。请求不会携带宿主 Cookie，不允许重定向。

```js
const result = await nexlet.network.request({
  id: 'request-1', // 当前会话内唯一；由插件生成，用于取消
  url: 'https://example.com/v1/chat/completions',
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ...' },
  body: JSON.stringify({ model: 'your-model', messages: [{ role: 'user', content: 'Hello' }] }),
  timeoutMs: 60000
});
// { status: 200, body: '...' }；HTTP 错误状态也返回，由插件解释；网络/取消/超时 reject。
await nexlet.network.cancel('request-1');
// 旧插件兼容：resetPermissions() 仍可调用，取消本会话请求并清理旧授权数据；
// 不会重新启用确认弹窗，新插件无需提供重置授权入口。
```

只支持 HTTPS，以及 `localhost` / `127.0.0.1` / `[::1]` 的 HTTP 地址。URL 不得含账号、密码或 fragment；方法为 GET（默认）或 POST。请求头仅支持 `Accept`、`Content-Type`、`Authorization`、`X-API-Key`。正文最多 256 KB，响应最多 2 MB，每会话最多 4 个请求。默认超时 30 秒，可设置 1–120000 ms；超时从发起请求开始。退出、停用、卸载、更新或崩溃会取消该会话请求；分离窗口保留会话。未声明 network.request 的插件不能使用桥接。

密钥需声明 `secrets` 权限，按插件隔离，名称规则与 storage 相同：

```js
const { persistent } = await nexlet.secrets.set('apiKey', 'user-provided-key');
const key = await nexlet.secrets.get('apiKey'); // string | null
await nexlet.secrets.set('apiKey', null); // 删除
```

`persistent: true` 表示经系统 safeStorage 加密后落盘；无可用系统加密或 Linux 使用 `basic_text` 时，仅在当前插件会话内保存并返回 `false`，插件应明确提示用户。分离窗口保留临时密钥，退出会清除；无法解密旧数据会 reject，插件应允许重新填写。不要把密钥放入普通 `storage`、日志或 URL。卸载保留数据时也保留密文，选择清理数据则同时清除密文与旧版遗留的 origin 授权。此能力是本机静态存储保护，不能阻止已获授权的插件读取自己的密钥。

插件压缩包最多 64 MiB，解压合计 128 MiB，单个文件/运行时资源 32 MiB；市场下载与本地安装遵循相同限制。`runtime.compute` 允许同源资源 fetch、动态代码、WASM 和本地 Worker，不开放 Node、任意文件或直接外网访问。普通插件继续使用原有严格 CSP。

## 共享 AI 与 OCR／翻译（Nexlet 0.2.47）

声明 `ai` 权限后，`ai.sharedModels()` 返回宿主模型配置，不含密钥。`ai.generate({id, request})` 使用指定 providerId/model，省略时使用宿主默认模型；返回 text、toolCalls 和可用时的 usage。`ai.onEvent` 按任务 ID 提供 text、tool、usage、complete、failure 事件。拒绝、截断、取消、断流会失败，不返回正常完成；工具调用仅返回数据，不执行。可用 `tasks.cancel(id)` 取消。旧 configure/models/chat/onChunk 保持原合同和私有配置。

宿主分别编码 Chat Completions、Responses 和 Anthropic Messages；Responses 默认 store=false。模型设置支持可选上下文上限、OpenAI low/medium/high 推理强度、适用 Anthropic 模型的手动思考预算。推理参数不会附带 Temperature。上下文按文本 UTF-8 字节保守估算，图片和精确 Token 限制仍由服务端校验。修改地址或协议清除旧 Key；导入旧模型不会复制私有密钥。

声明 `capabilities` 权限后可 list/run/onProgress。OCR 请求使用 Uint8Array 图片（最多 20 MiB），返回 text 和可选 blocks（文字、点坐标、置信度）；翻译请求使用 text、targetLanguage 和可选 sourceLanguage。提供商 ID 为 `pluginId:providerId`，省略则使用用户选定默认值。没有默认值或提供商失败时直接报告错误，不自动从本地切到云端。调用最多 120 秒，同一提供商插件最多并行 3 项，退出消费会话或停用/升级提供商会取消任务。

```js
// manifest.permissions: ["ai", "capabilities"]
const shared = await nexlet.ai.sharedModels();
const id = crypto.randomUUID();
const off = nexlet.ai.onEvent(({ id: taskId, event }) => {
  if (taskId === id && event.type === 'text') appendText(event.delta);
});
try {
  const result = await nexlet.ai.generate({ id, request: {
    messages: [{ role: 'user', content: 'Summarize this text' }]
  }});
  showText(result.text);
} finally { off(); }
// await nexlet.tasks.cancel(id);
const providers = await nexlet.capabilities.list();
const result = await nexlet.capabilities.run({ id: crypto.randomUUID(), request: {
  capability: 'translation', text: 'Hello', targetLanguage: 'zh-CN'
}});
```

提供商在 manifest 的 providers 数组声明 id/name/capability/locality/languages/entry，可选 configSchema；entry 必须为包内 HTML。隐藏沙箱加载入口，通过 `window.nexletProvider.listen` 接收 providerId/request/config，使用 progress/finish/fail 回复。宿主校验配置和结果。locality=local 不提供网络或共享 AI；cloud 入口仍需声明 network.request 或 ai 权限。入口示例见插件仓库的 `plugins/ocr/provider.ts` 和 `plugins/translate/provider.js`。新配置在宿主设置中选择，用户账号会话不对插件开放。
