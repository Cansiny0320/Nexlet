[简体中文](plugin-sdk-extensions.md) · [繁體中文](plugin-sdk-extensions.zh-Hant.md) · [English](plugin-sdk-extensions.en.md)

# Nexlet SDK 扩展能力

本扩展沿用 `apiVersion: 1`，保持原接口不变，以 Nexlet API 覆盖桌面插件的能力分类。**不提供 uTools 插件源码、接口名称或安装包兼容层。** 这些改动尚未发布；旧正式版宿主不认识新增权限。公开合同位于 `sdk/index.d.ts` 和 `src/shared/plugin-api.ts`，插件仓类型由 `node scripts/sync-plugin-sdk.mjs` 生成。

## 权限和运行边界

| manifest 权限 | 能力 |
| --- | --- |
| `files` | 本机绝对路径读写、目录、文件操作、文件对话框、图标、文件拖拽 |
| `process` | 执行本机程序，可选择环境变量与工作目录；没有 shell 字符串插值 |
| `backend` | 插件包内的独立 Node.js 后台、RPC、持久调度 |
| `windows` | 宿主窗口、插件子窗口及消息 |
| `notifications` | 系统通知与点击事件 |
| `browser` | 独立浏览器、页面求值/输入、cookie、代理、缓存；下载与文件输入另需 `files` |
| `screen` | 显示器、截图来源、截屏、区域选择、取色、坐标 |
| `input.simulate` | 键盘、鼠标、回贴；剪贴板读写仍需原权限 |
| `media` | Sharp 图像 worker、FFmpeg；FFmpeg 需要 `media`、`files`、`process` 以及显式 `executable` |
| `ai` | 配置模型 provider、模型列表、chat、流式输出和工具调用片段 |
| `services` | 配置账号/授权/checkout/同步 provider |
| `tools` | 注册 JSON Schema 校验的工具并调用后台方法，另需 `backend` |
| `mcp` | 显式启动本机 MCP HTTP 服务，另需 `tools`、`backend` |
| `runtime.compute` | 本地计算（动态代码、WASM 和本地 Worker）；保留沙箱，无 Node 或直接外网访问 |

旧的 `clipboard.read`、`clipboard.write`、`shell.openExternal`、`network.request`、`secrets` 继续有效。独立 KV、文档数据库、当前插件的动态功能和搜索 UI 不需额外权限。

前端与插件子窗口保留 sandbox、contextIsolation、无 Node integration。Node backend 和 `process` 是可信本地代码能力，**独立进程用于生命周期与崩溃隔离，不是 OS 安全沙箱**；这些插件能够访问当前用户的本地资源。权限显示在已安装插件详情。远程浏览器不注入 Nexlet API，页面不能获得插件 bridge。资源句柄由实际调用方会话持有，其他插件或重新打开的会话不能复用。

## 任务与后台

长任务传入唯一 `id`，可用 `tasks.cancel(id)` 取消。同一会话最多 32 个并发任务，超时范围 1–3,600,000 ms；一般默认 30 秒，媒体 60 秒，AI 120 秒。`tasks.onProgress`、`ai.onChunk` 等均返回取消订阅函数。会话关闭后停止投递事件。

```ts
const off = nexlet.tasks.onProgress(({ id, value }) => console.log(id, value));
const result = await nexlet.backend.call({ id: 'job', method: 'hash', args: { text: 'hello' } });
await nexlet.tasks.cancel('job');
off();
```

Manifest 增加 `"backend": "backend.cjs"` 和 `backend` 权限。包内入口禁止路径越界或符号链接。后台导出 `handlers` 对象：

```ts
import { createHash } from 'node:crypto';
import type { BackendHandlers } from '@nexlet/plugin-api';
export const handlers = {
  async hash(args, { signal, emit, dataDirectory }) {
    const { text } = args as { text: string }; // 实际插件应校验业务输入
    signal.throwIfAborted();
    emit({ stage: 'hashing' });
    return { digest: createHash('sha256').update(text).digest('hex') };
  }
} satisfies BackendHandlers;
```

取消任一后台调用会终止该插件后台进程，**同一进程中的并行调用也会失败**，后续调用自动重启。关前端取消其 RPC；无调用的后台可继续驻留，持久调度不依赖前端。停用、卸载、更新、宿主退出停止后台。`dataDirectory` 按插件隔离，卸载勾选删除数据才删除。

```ts
await nexlet.schedules.set({ id: 'refresh', method: 'refresh', at: Date.now() + 60_000, intervalMs: 60_000 });
const jobs = await nexlet.schedules.list(); // 包含 lastRun / lastError
await nexlet.schedules.remove('refresh');
```

调度每秒检查一次，每插件最多 100 个，间隔至少 1 秒，每次执行最多 5 分钟。关机期间不执行，重启后到期任务补执行一次；执行前持久化下一次截止时间，避免连续补跑。一次任务完成后保留状态，`at` 为最大安全整数。需要严格业务幂等时，后台自行使用业务幂等键。

## 文档、附件与 KV

原 `storage.get/set` 之外新增 `keys/remove`，原配额仍为 1 MB。文档数据库单文档 1 MB、单附件 10 MB、每插件共 50 MB。创建时不传 `rev`；更新和删除必须携带当前 `rev`，冲突报 `document conflict`，不会静默覆盖。`bulk` 最多 500 个且原子提交。附件写入/删除也改变文档 revision。

```ts
const old = await nexlet.database.get('settings');
const doc = await nexlet.database.put({ id: 'settings', rev: old?.rev, value: { theme: 'dark' } });
await nexlet.database.putAttachment(doc.id, doc.rev, 'preview', 'image/png', pngBytes);
const attachment = await nexlet.database.getAttachment('settings', 'preview');
const page = await nexlet.database.query({ prefix: 'setting', after: '', limit: 100 });
```

## 窗口、指令与搜索

`window.info/show/hide/focus/set/close/detach` 操作当前窗口；传入 `window` 句柄操作自己的子窗口。`set` 支持 bounds、alwaysOnTop、fullScreen、resizable、opacity、title。主插件 `close` 会关闭插件会话，不退出宿主。子窗口只加载包内 HTML，继承同插件能力，通过 `context()` 获取当前输入。

```ts
const child = await nexlet.window.create({ entry: 'child.html', width: 640, height: 480 });
nexlet.window.onMessage(({ from, message }) => console.log(from, message));
await nexlet.window.send({ selected: 'one' }, child);
// child.html 中：await nexlet.window.send({ accepted: true }); // 发送给父窗口
await nexlet.window.close(child);
```

`commands.set` 替换插件动态功能列表（最多 30 个），不能覆盖 manifest 的静态 code。列表持久保存并加入宿主搜索；`commands.redirect` 请求打开某插件功能，接收 `{pluginId,code,payload?}`，返回表示已接受，异步启动失败由宿主显示。

```ts
await nexlet.commands.set([{ code: 'recent', name: '最近记录', keywords: ['recent'] }]);
await nexlet.search.set({ placeholder: '检索记录', text: '', visible: true });
nexlet.search.onChange(async ({ text }) => {
  await nexlet.search.results([{ id: '1', title: `搜索 ${text}`, description: '回车或点击结果' }]);
});
nexlet.search.onSelect(({ id }) => { void nexlet.search.results([]); });
```

`search.results` 最多 100 条，非空时宿主结果区域覆盖插件视图；清空后恢复。输入框随插件分离迁移。`dialogs.message/open/save` 提供系统对话框；`notifications.show` 与 `onClick` 提供系统通知，会话关闭时收回通知。

## 系统、文件、输入与屏幕

```ts
const environment = await nexlet.system.info();
const downloads = await nexlet.system.path('downloads');
const picked = await nexlet.dialogs.open({ multiple: true });
const bytes = await nexlet.files.read(picked.filePaths[0]);
await nexlet.files.write(`${downloads}/result.bin`, bytes); // 默认拒绝覆盖
await nexlet.process.run({ id: 'version', executable: '/absolute/path/to/tool', args: ['--version'] });
const sources = await nexlet.screen.sources();
const shot = await nexlet.screen.capture({ sourceId: sources[0].id, width: 1920, height: 1080 });
const region = await nexlet.screen.select({ id: 'select' }); // Esc 返回 null
const color = await nexlet.screen.pickColor({ id: 'color' });
```

文件单次读写最多 16 MB；`list/stat/mkdir/rename/copy/remove`、`system.fileIcon/openPath/reveal/trash` 操作本机路径，`remove` 仅删除文件，`trash` 使用系统回收站。进程输出最多 8 MB，取消时终止进程组（Windows 使用 taskkill）。

图片剪贴板使用 PNG bytes，`clipboard.readImage/writeImage/readFiles/writeFiles` 补充文本接口。`input.paste()` 回贴到宿主已记住的外部应用，找不到目标则报错；`input.drag({files})` 应在插件拖拽手势中调用。`input.key({code,modifiers})` 的 code 是 macOS virtual key、Windows virtual key、Linux X11 keycode。`input.mouse` 支持 move/click/doubleClick/down/up/scroll，坐标采用桌面 DIP。

`screen.displays/cursor/convertPoint` 提供显示器与坐标；截图 `region` 使用返回图像的像素坐标，交互选择返回桌面 DIP 区域。屏幕和辅助功能依赖 macOS 系统授权；不会自动修改系统设置。Linux 输入需要 X11 与 xdotool，Wayland 明确报不支持。通知、屏幕来源和窗口截图也受具体桌面环境限制。

## 浏览器与媒体

```ts
const browser = await nexlet.browser.create({ visible: false });
await nexlet.browser.perform({ id: 'open', browser, action: { type: 'navigate', url: 'https://example.com' } });
await nexlet.browser.perform({ id: 'wait', browser, action: { type: 'wait', selector: '#ready' } });
const title = await nexlet.browser.perform({ id: 'read', browser, action: { type: 'evaluate', script: 'document.title' } });
const pdf = await nexlet.browser.perform({ id: 'pdf', browser, action: { type: 'pdf' } });
await nexlet.browser.close(browser);
```

浏览器每前端会话最多 8 个，只导航 HTTP(S)，所有弹窗默认拒绝，网页系统权限默认拒绝。支持 click/type/input、文件 input、下载、截图/PDF、cookie、userAgent、代理和缓存。浏览器 cookie/缓存按插件持久隔离；卸载删除数据会清空。超时或取消操作会关闭对应浏览器。下载必须指定不存在的绝对路径，非 API 发起的下载会阻止。

```ts
const resized = await nexlet.media.image({ id: 'resize', data: pngBytes, operations: [{ op: 'resize', args: [320, 200] }], format: 'webp' });
const metadata = await nexlet.media.image({ id: 'metadata', data: pngBytes, metadata: true });
await nexlet.media.ffmpeg({ id: 'convert', executable: ffmpegPath, args: ['-i', sourceFile, '-n', targetFile] });
```

Sharp 在 utility process 运行，支持缩放、旋转、裁剪、边框、翻转、背景、模糊、锐化、阈值、色彩/通道操作及 PNG/JPEG/WebP/AVIF/TIFF/GIF 输出。输入/输出最多 32 MB，输入限制 1 亿像素。`operations[].args` 使用相应 [Sharp 官方参数](https://sharp.pixelplumbing.com/api-operation/)。FFmpeg 通过独立进程执行，`tasks.onProgress` 返回 stdout/stderr；进度启用 `-progress pipe:1`。宿主不再内置 FFmpeg；必须通过 `executable` 提供本机路径，并同时声明 `media`、`files`、`process` 权限。省略路径时明确报错。

## AI、工具与 MCP

```ts
await nexlet.ai.configure({ baseUrl: 'https://provider.example/v1', apiKey: userKey });
const models = await nexlet.ai.models({ id: 'models' });
const unsubscribe = nexlet.ai.onChunk(({ id, chunk }) => console.log(id, chunk));
const reply = await nexlet.ai.chat({ id: 'chat', stream: true, request: { model: models[0].id, messages: [{ role: 'user', content: '你好' }] } });
unsubscribe();
```

使用 OpenAI-compatible `/models` 和 `/chat/completions`。非流式返回 completion，流式返回 `{content,toolCalls}` 并推送原始 chunk。`request.tools` 可传函数工具定义；工具调用由插件显式执行，不自动执行模型返回的任意操作。SSE 未收到 `[DONE]` 就断开会报错。单次请求 2 MB、响应 8 MB，拒绝跨站重定向。

```ts
await nexlet.tools.register({ name: 'hash', description: '计算文本 SHA-256', method: 'hash', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } });
const result = await nexlet.tools.call({ id: 'hash-call', name: 'hash', args: { text: 'hi' } });
const connection = await nexlet.mcp.start(); // {url,token}；显式启动才监听
await nexlet.mcp.stop();
```

工具注册每插件最多 100 个，参数用 JSON Schema 校验，仅支持 schema 内部 `$ref`。MCP 为 [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports) 的无状态 JSON 响应模式，版本 2025-06-18，支持 initialize/ping/tools/list/tools/call/cancelled。仅监听 `127.0.0.1` 随机端口，使用 `Authorization: Bearer <token>`，拒绝 Origin 与错误 Host，GET 返回 405。每个服务仅暴露所属插件的工具，关闭前端即停止；不会自动写入其他 MCP 客户端配置。

## 账号、授权、checkout 与同步服务合同

`services.configure({baseUrl,apiKey?})` 配置插件服务。服务和 AI 的 key 独立保存于已有加密密钥存储；系统加密不可用时明确返回 `persistent:false`，仅当前会话保留。改变 base URL 不会自动把旧 key 发送到新地址。`configure(null)` 清除该配置。`status()` 只报告配置，不意味着服务已连通。

| SDK | HTTP 合同 | 必要返回字段 |
| --- | --- | --- |
| `account({id})` | GET `/account` | `{user:null}` 或 `{user:{id,...}}` |
| `login({id})` | POST `/auth/start`，body `{pluginId}` | `{url,sessionId}`；插件自行明确打开登录页 |
| `loginStatus({id,sessionId})` | POST `/auth/status` | `{status:'pending'|'expired'}` 或 `{status:'complete',token}`；token 被加密保存，不返回前端 |
| `license({id,product})` | GET `/license?product=...` | `{active:boolean,...}` |
| `checkout({id,product,idempotencyKey})` | POST `/checkout` | `{url:'https://...',...}`；仅创建 checkout，不自动支付 |
| `syncGet({id,key})` | GET `/sync/<encoded key>` | `{value,version:string|null}` |
| `syncPut({id,key,value,expectedVersion,idempotencyKey})` | POST `/sync/<encoded key>` | `{version:string}`；版本不匹配服务必须返回 HTTP 409 |

```ts
const current = await nexlet.services.syncGet({ id: 'get', key: 'settings' });
await nexlet.services.syncPut({ id: 'save', key: 'settings', expectedVersion: current.version, idempotencyKey: crypto.randomUUID(), value: { theme: 'dark' } });
```

这些是已实现并经本地 fixture 验证的适配协议，不是已经部署的 Nexlet 账号、支付、授权或云存储服务。实际供应商需要实现上述合同；付款、订单真实性、业务幂等与授权最终判定由服务负责。本次没有注册服务、创建真实 checkout 或发生交易。

验证范围见 [SDK 验证记录](validation/plugin-sdk-2026-10-13.md)。

## 本地计算与结果返回

插件压缩包最多 64 MiB，解压合计 128 MiB，单个文件/运行时资源 32 MiB；市场下载与本地安装遵循相同限制。`runtime.compute` 允许同源资源 fetch、动态代码、WASM 和本地 Worker，不开放 Node、任意文件或直接外网访问。普通插件继续使用原有严格 CSP。

`search.returnToLauncher(text)` 关闭当前插件并将非空文本送回启动器继续处理，最多 500000 字符，不需额外权限。`clipboard.snapshot()` 需要 `clipboard.read`，返回会话绑定的一次性 token 或 `null`；`clipboard.writeTextIfUnchanged(token,text)` 需要读写两项权限，仅在剪贴板未改变且 token 尚有效时写入，返回 boolean。新快照替换旧 token，使用或关闭会话后失效。
