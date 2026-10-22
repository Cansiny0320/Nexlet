[简体中文](plugin-sdk-extensions.md) · [繁體中文](plugin-sdk-extensions.zh-Hant.md) · [English](plugin-sdk-extensions.en.md)

# Nexlet SDK extensions

These extensions retain `apiVersion: 1` and existing interfaces, adding desktop capabilities through Nexlet APIs. **They do not provide compatibility with uTools source, API names, or packages.** Set the minimum host version for the APIs you use; older hosts may not recognize newer permissions. Public contracts live in `sdk/index.d.ts` and `src/shared/plugin-api.ts`; `node scripts/sync-plugin-sdk.mjs` generates the plugin repository's types.

## Result handoff and drafts (v0.2.40)

`nexlet.results.publish(result)` accepts `{ type: 'text', text, html? }`, `{ type: 'image', data }` (a data URL), or `{ type: 'files', resources }` (file tokens held by this plugin), and returns `Promise<true>`. The host opens the launcher for the user to choose the next tool without writing the clipboard. Files are revalidated and granted to the destination; arbitrary paths are not accepted. A text `PluginContext` may include untrusted `html`, which must be sanitized before rendering. Existing `search.returnToLauncher(text)` remains supported.

`nexlet.session.read()` / `save(state)` access JSON drafts isolated by plugin, feature, and window; `readImage()` / `saveImage(Uint8Array)` provide one image slot. JSON is limited to 4 MB, each image to 20 MiB, and the total image cache to 64 MiB. Drafts last for the current run by default. User opt-in permits main-window restart restoration; detached windows are not persisted. Drafts are excluded from configuration export and must not contain API keys. Use `secrets` for credentials.

Restore on `onEnter` only when no explicit new input is present. Return the saving Promise from `onOut`; state and image saves are permitted while closing, but new tasks are not. Restoration must not automatically restart network or compute work. Guard asynchronous results with a generation check. Feature-detect `nexlet.session` and `nexlet.results` for older hosts; plugins using these APIs should declare `minHostVersion: "0.2.40"`.

## Permissions and runtime boundaries

| Manifest permission | Capability |
| --- | --- |
| `files` | Absolute local path reads/writes, directories, file operations/dialogs/icons, dragging |
| `process` | Local executables with optional environment and working directory; no shell string interpolation |
| `backend` | Packaged Node.js backend, RPC, persistent schedules |
| `windows` | Host window, plugin child windows, messaging |
| `notifications` | System notifications and clicks |
| `browser` | Isolated browser, evaluation/input, cookies, proxy, cache; download/file input also needs `files` |
| `screen` | Displays, sources, capture, region selection, color picking, coordinates |
| `input.simulate` | Keyboard, mouse, paste-back; clipboard permissions remain separate |
| `media` | Sharp / FFmpeg; FFmpeg: `media` + `files` + `process`, explicit `executable` |
| `ai` | Model provider configuration, models, chat, streaming and tool-call chunks |
| `services` | Account/license/checkout/sync provider configuration |
| `tools` | JSON Schema validated tools backed by methods; also needs `backend` |
| `mcp` | Explicit local MCP HTTP server; also needs `tools` and `backend` |
| `runtime.compute` | Local computation (dynamic code, WASM and local Workers); sandboxed, without Node or direct external network access |

Existing `clipboard.read`, `clipboard.write`, `shell.openExternal`, `network.request`, and `secrets` remain valid. Isolated KV, documents, dynamic commands, search UI, and application-language APIs require no additional permission. See [language integration](i18n.en.md).

Frontends and child windows retain sandbox/contextIsolation without Node integration. Node backends and `process` are trusted local code capabilities: **a separate process isolates lifecycle/crashes, not OS privileges**. They can access the current user's resources. Installed-plugin details show permissions. Remote browsers receive no Nexlet bridge. Resource handles belong to the actual calling session and cannot be reused by other plugins or reopened sessions.

## Clipboard HTML (Nexlet 0.2.36+)

`nexlet.clipboard.readHTML(): Promise<string | null>` requires `clipboard.read`. It returns the first `text/html` representation, or `null` when absent. HTML over 2 MiB is rejected without truncation. This is untrusted markup: plugins must sanitize tags, attributes and CSS before rendering it. Separate `readText()` and `readHTML()` calls are not an atomic snapshot. Feature-detect the method on older hosts; user-initiated paste events remain available. See [the detailed contract](plugin-clipboard-html.md).

## Tasks and backends

Long operations take a unique `id` and support `tasks.cancel(id)`. Each session allows 32 concurrent tasks, with timeouts from 1 to 3,600,000 ms. Defaults: generally 30 seconds, media 60 seconds, AI 120 seconds. `tasks.onProgress` and `ai.onChunk` return unsubscribe functions. Events stop after session close.

```ts
const off = nexlet.tasks.onProgress(({ id, value }) => console.log(id, value));
const result = await nexlet.backend.call({ id: 'job', method: 'hash', args: { text: 'hello' } });
await nexlet.tasks.cancel('job');
off();
```

Declare `"backend": "backend.cjs"` and the `backend` permission. Entry paths cannot escape the package or use symlinks. Export a `handlers` object:

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

Canceling any backend call terminates that plugin's backend process; **parallel calls in it also fail**. A subsequent call restarts it. Closing the frontend cancels its RPC; an idle backend may stay resident, and persistent schedules do not depend on the frontend. Disable, uninstall, update, or host exit stops it. `dataDirectory` is plugin-isolated and is removed only when uninstalling with data deletion.

```ts
await nexlet.schedules.set({ id: 'refresh', method: 'refresh', at: Date.now() + 60_000, intervalMs: 60_000 });
const jobs = await nexlet.schedules.list(); // 包含 lastRun / lastError
await nexlet.schedules.remove('refresh');
```

Schedules are checked each second: at most 100 per plugin, minimum interval one second, maximum execution five minutes. They do not execute while the machine is off; overdue jobs run once on restart. The next deadline is persisted before execution to prevent repeated catch-up. Completed one-shot jobs retain status with `at` set to the maximum safe integer. Use business idempotency keys when strict guarantees are needed.

## Documents, attachments, and KV

`storage.keys/remove` extend `get/set`; its 1 MB quota remains. Documents allow 1 MB each, attachments 10 MB each, with a 50 MB total per plugin. Omit `rev` on creation; updates/deletes require the current revision and reject with `document conflict` instead of silently overwriting. `bulk` commits atomically, up to 500 items. Attachment changes also change revisions.

```ts
const old = await nexlet.database.get('settings');
const doc = await nexlet.database.put({ id: 'settings', rev: old?.rev, value: { theme: 'dark' } });
await nexlet.database.putAttachment(doc.id, doc.rev, 'preview', 'image/png', pngBytes);
const attachment = await nexlet.database.getAttachment('settings', 'preview');
const page = await nexlet.database.query({ prefix: 'setting', after: '', limit: 100 });
```

## Windows, commands, and search

`window.info/show/hide/focus/set/close/detach` controls the current window; provide a `window` handle for your own child. `set` supports bounds, alwaysOnTop, fullScreen, resizable, opacity, and title. Closing the main plugin closes its session, not the host. Children load packaged HTML, inherit capabilities, and read input through `context()`.

```ts
const child = await nexlet.window.create({ entry: 'child.html', width: 640, height: 480 });
nexlet.window.onMessage(({ from, message }) => console.log(from, message));
await nexlet.window.send({ selected: 'one' }, child);
// child.html 中：await nexlet.window.send({ accepted: true }); // 发送给父窗口
await nexlet.window.close(child);
```

`commands.set` replaces up to 30 persistent dynamic features without overriding static manifest codes. They appear in host search. `commands.redirect({pluginId,code,payload?})` accepts a launch request; later startup failure is shown by the host.

```ts
await nexlet.commands.set([{ code: 'recent', name: '最近记录', keywords: ['recent'] }]);
await nexlet.search.set({ placeholder: '检索记录', text: '', visible: true });
nexlet.search.onChange(async ({ text }) => {
  await nexlet.search.results([{ id: '1', title: `搜索 ${text}`, description: '回车或点击结果' }]);
});
nexlet.search.onSelect(({ id }) => { void nexlet.search.results([]); });
```

`search.results` accepts 100 results. Nonempty results cover the plugin view; clearing restores it. The search field moves with detaching. `dialogs.message/open/save` provides native dialogs. `notifications.show/onClick` provides system notifications, withdrawn when the session closes.

## System, files, input, and screen

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

File reads/writes allow 16 MB per call. `list/stat/mkdir/rename/copy/remove` and `system.fileIcon/openPath/reveal/trash` work with local paths; `remove` deletes files only and `trash` uses the system trash. Process output is capped at 8 MB. Cancellation terminates the process group (taskkill on Windows).

Image clipboard uses PNG bytes. `clipboard.readImage/writeImage/readFiles/writeFiles` supplement text methods. `input.paste()` targets the remembered external app or rejects if unavailable. Call `input.drag({files})` from a drag gesture. `input.key` uses macOS virtual keys, Windows virtual keys, or Linux X11 keycodes. `input.mouse` supports move/click/doubleClick/down/up/scroll in desktop DIP coordinates.

`screen.displays/cursor/convertPoint` provides displays and coordinates. Capture `region` uses output-image pixels; interactive selection returns desktop DIP. macOS screen/accessibility capabilities need system authorization and never change it automatically. Linux input needs X11 and xdotool; Wayland is explicitly unsupported. Notifications, sources, and window capture also depend on desktop capabilities.

## Browsers and media

```ts
const browser = await nexlet.browser.create({ visible: false });
await nexlet.browser.perform({ id: 'open', browser, action: { type: 'navigate', url: 'https://example.com' } });
await nexlet.browser.perform({ id: 'wait', browser, action: { type: 'wait', selector: '#ready' } });
const title = await nexlet.browser.perform({ id: 'read', browser, action: { type: 'evaluate', script: 'document.title' } });
const pdf = await nexlet.browser.perform({ id: 'pdf', browser, action: { type: 'pdf' } });
await nexlet.browser.close(browser);
```

Each frontend session allows eight browsers, navigating HTTP(S) only. Popups and system permissions are denied by default. Supported operations include click/type/input, file input, downloads, screenshots/PDF, cookies, userAgent, proxy, and cache. Cookie/cache storage is persistent and isolated per plugin, deleted when uninstalling with data deletion. Timeout/cancel closes the affected browser. Downloads require a nonexistent absolute path; downloads not initiated through the API are blocked.

```ts
const resized = await nexlet.media.image({ id: 'resize', data: pngBytes, operations: [{ op: 'resize', args: [320, 200] }], format: 'webp' });
const metadata = await nexlet.media.image({ id: 'metadata', data: pngBytes, metadata: true });
await nexlet.media.ffmpeg({ id: 'convert', executable: ffmpegPath, args: ['-i', sourceFile, '-n', targetFile] });
```

Sharp runs in a utility process and supports resize, rotate, crop, borders, flip, background, blur, sharpen, threshold, color/channels, and PNG/JPEG/WebP/AVIF/TIFF/GIF output. Input/output are limited to 32 MB and input to 100 million pixels. `operations[].args` follows [Sharp parameters](https://sharp.pixelplumbing.com/api-operation/). FFmpeg runs separately; `tasks.onProgress` returns stdout/stderr, with progress enabled by `-progress pipe:1`. The host no longer bundles FFmpeg. Supply a local executable path explicitly and declare all three permissions: `media`, `files`, and `process`. Omitting `executable` produces an error.

## AI, tools, and MCP

```ts
await nexlet.ai.configure({ baseUrl: 'https://provider.example/v1', apiKey: userKey });
const models = await nexlet.ai.models({ id: 'models' });
const unsubscribe = nexlet.ai.onChunk(({ id, chunk }) => console.log(id, chunk));
const reply = await nexlet.ai.chat({ id: 'chat', stream: true, request: { model: models[0].id, messages: [{ role: 'user', content: '你好' }] } });
unsubscribe();
```

Providers use OpenAI-compatible `/models` and `/chat/completions`. Non-streaming returns a completion; streaming returns `{content,toolCalls}` and emits raw chunks. `request.tools` accepts function definitions, but plugins explicitly execute tools; model-returned operations are never automatically executed. SSE disconnect before `[DONE]` rejects. Request limit: 2 MB; response: 8 MB; cross-site redirects are denied.

```ts
await nexlet.tools.register({ name: 'hash', description: '计算文本 SHA-256', method: 'hash', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } });
const result = await nexlet.tools.call({ id: 'hash-call', name: 'hash', args: { text: 'hi' } });
const connection = await nexlet.mcp.start(); // {url,token}；显式启动才监听
await nexlet.mcp.stop();
```

Register up to 100 tools per plugin. JSON Schema validates arguments and permits only internal `$ref`. MCP uses [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports), stateless JSON response mode, version 2025-06-18, supporting initialize/ping/tools/list/tools/call/cancelled. It listens only on a random `127.0.0.1` port with `Authorization: Bearer <token>`, rejects Origin and incorrect Host, and returns 405 for GET. Each server exposes only its plugin's tools and stops with the frontend. It never changes other MCP clients' configuration.

## Account, license, checkout, and sync contracts

`services.configure({baseUrl,apiKey?})` configures a provider. Service and AI keys are separately stored through encrypted secrets. If encryption is unavailable, `persistent:false` means session-only storage. Changing base URL never automatically forwards the old key. `configure(null)` clears configuration. `status()` reports configuration, not successful connectivity.

| SDK | HTTP contract | Required response |
| --- | --- | --- |
| `account({id})` | GET `/account` | `{user:null}` or `{user:{id,...}}` |
| `login({id})` | POST `/auth/start`, body `{pluginId}` | `{url,sessionId}`; plugin explicitly opens login |
| `loginStatus({id,sessionId})` | POST `/auth/status` | `{status:'pending'|'expired'}` or `{status:'complete',token}`; token is encrypted and withheld from frontend |
| `license({id,product})` | GET `/license?product=...` | `{active:boolean,...}` |
| `checkout({id,product,idempotencyKey})` | POST `/checkout` | `{url:'https://...',...}`; creates checkout, never pays automatically |
| `syncGet({id,key})` | GET `/sync/<encoded key>` | `{value,version:string|null}` |
| `syncPut({id,key,value,expectedVersion,idempotencyKey})` | POST `/sync/<encoded key>` | `{version:string}`; mismatches must return HTTP 409 |

```ts
const current = await nexlet.services.syncGet({ id: 'get', key: 'settings' });
await nexlet.services.syncPut({ id: 'save', key: 'settings', expectedVersion: current.version, idempotencyKey: crypto.randomUUID(), value: { theme: 'dark' } });
```

These adapters are implemented and tested against local fixtures; they are not deployed Nexlet account, payment, licensing, or cloud-storage services. Providers must implement the contracts and enforce payments, order validity, business idempotency, and authorization. No service registration, real checkout, or transaction is part of this implementation. See the [SDK validation record](validation/plugin-sdk-2026-10-13.md).

## Local compute and result handoff

Plugin archives allow 64 MiB compressed, 128 MiB expanded and 32 MiB per file/runtime resource. Marketplace downloads and local installs share these limits. `runtime.compute` permits same-origin fetch, dynamic code, WASM and local Workers without Node, arbitrary files or direct external network access. Other plugins retain their strict CSP.

`search.returnToLauncher(text)` closes the current plugin and passes non-empty text back to the launcher, up to 500000 characters, without additional permissions. `clipboard.snapshot()` requires `clipboard.read` and returns a session-bound, single-use token or `null`. `clipboard.writeTextIfUnchanged(token,text)` requires both clipboard permissions and writes only if the clipboard is unchanged and the token remains valid, returning a boolean. A new snapshot replaces the previous token; use or session closure invalidates it.
