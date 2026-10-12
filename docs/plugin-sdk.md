# Nexlet Plugin API v1

插件由 `plugin.json` 和本地 HTML / CSS / JavaScript 组成。使用 Web 标准编写界面，通过沙箱 preload 提供的 `window.nexlet` 请求宿主能力。内置工具与外部插件使用不同的 IPC 接口。

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

## 插件市场

公开目录位于 [Nexlet-plugins](https://github.com/Cansiny0320/Nexlet-plugins)。客户端只从该仓库的 `index.json` 读取版本化目录，从同一仓库的 GitHub Releases 下载插件包。条目包含平台和最低 Nexlet 版本，安装包 ID / 版本必须一致，不要求 Hash 字段。

市场安装、更新复用本地包校验和安装权限确认，成功后才替换安装记录。取消或失败保留旧版本与独立数据；开发目录不会被市场覆盖，也不会自动降级。离线时可浏览已缓存的目录，首次连接失败显示可重试提示。

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

每个插件使用独立内存 session 和 sandbox，默认通过 WebContentsView 内嵌主窗口，可分离为独立窗口。`nodeIntegration` 关闭，`contextIsolation` 开启，无 `require`、`process` 或任意 IPC。宿主根据调用 webContents、主 frame、插件来源及安装时授权快照检查每个请求。

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
// { id, code, type: 'text' | 'files' | 'image', payload, from: 'input' | 'paste' | 'drop' }
// text.payload: 完整文本；files.payload: Resource[]；image.payload: Resource
// Resource: { id, name, size, isDirectory, path?, mime? }
if (context.type === 'files' && !context.payload[0].isDirectory) {
  const bytes = await nexlet.input.read(context.payload[0].id); // Uint8Array
  const text = new TextDecoder().decode(bytes);
}
```

输入由用户粘贴或拖入，仅在选择功能后给选中的插件会话授予只读 token。最多 100 个文件，单文件/图片 20 MB、文件合计 64 MB、图片 3600 万像素；文本最多 50 万字符。目录只提供元信息。宿主检测文件替换和修改，不提供任意路径读取。再次进入、退出、禁用、更新、卸载或崩溃后，旧 token 失效。分离保留原 token。输入卡片本身不写系统剪贴板，只有用户明确选择「收进剪贴板」才写入。

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
