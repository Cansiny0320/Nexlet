[简体中文](plugin-sdk.md) · [繁體中文](plugin-sdk.zh-Hant.md) · [English](plugin-sdk.en.md)

# Nexlet Plugin API v1

Plugins consist of `plugin.json` and local HTML / CSS / JavaScript. Build the UI with Web standards and request host capabilities through the sandbox preload's `window.nexlet`. Built-in tools use a different IPC interface.

## Extended capabilities

Independent Node.js backends, document storage, windows and search UI, files/processes, screen/input, browser automation, Sharp/FFmpeg, AI/MCP, and account/sync adapters are described in [SDK extensions](plugin-sdk-extensions.en.md). See the [validation record](validation/plugin-sdk-2026-10-13.md) for tested scope. These extensions retain API v1 but are not released; older hosts do not necessarily support them.

## TypeScript development

Compile TypeScript to JavaScript before distributing a plugin. The plugin repository provides a [TS template](https://github.com/Cansiny0320/Nexlet-plugins/tree/main/templates/typescript) and [standalone type package](https://github.com/Cansiny0320/Nexlet-plugins/tree/main/sdk). From its root:

```sh
npm ci
npm run package:example
```

Import `dist/typescript-example.nexlet` or load `.build/templates/typescript`. `npm run dev -- templates/typescript` watches TS and static files; close and reopen the plugin to load changes. Reimport after manifest or permission changes. `npm run build` first runs `tsc --noEmit`, then bundles `src/main.ts` into `main.js` with esbuild and copies HTML/CSS and other assets. `npm run package` packages `.build/plugins`, excluding TS sources and development dependencies.

The local `@nexlet/plugin-api` package provides globals `nexlet` / `window.nexlet` and exported types such as `PluginApi`, `PluginManifest`, and `PluginContext`. It is not published on npm. Independent projects can install the repository's `sdk` directory as a local development dependency. Do not use `HostApi` from `src/shared/types.ts`; that interface serves the host's own pages. Types describe implemented APIs and do not change permissions or sandbox capabilities.

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

`id` is stable identity for commands, data isolation, and upgrades. Use reverse-domain notation, such as `org.nexlet.hello`; each segment starts with a lowercase letter and contains lowercase letters, digits, or hyphens. `main` must be a relative HTML path inside the package. Absolute paths, `..`, symlinks, and remote entries are rejected.

The ZIP root must directly contain `plugin.json`. Load a development directory to debug; reopening reads updated files, while manifest/permission changes require reimport. Only one session per plugin runs at a time; activation events switch between feature commands.

Optional `icon` is a relative PNG path, limited to 512 KB and 2048 pixels per dimension. The host generates thumbnails for search and installed lists. Omitting it uses the default plugin icon.

## Languages

`await nexlet.i18n.getLocale()` returns `zh-CN`, `zh-Hant`, or `en`; `nexlet.i18n.onChange(callback)` subscribes to application-language changes and returns an unsubscribe function. It requires no extra permission. `system.info().locale` continues to describe the operating system. Older hosts may lack `i18n`, so feature-detect it when supporting them. Subscribe before reading, and ignore a stale initial result if a change arrives first.

Optional `locales` on manifest, feature, and marketplace metadata maps language tags to translated `name`, `description`, and, where applicable, `category`. Missing labels fall back to the original field; IDs, feature codes, versions, paths, permissions, and stored user data do not change. See the [i18n guide](i18n.en.md) for examples and the bundled plugin conventions.

## Marketplace

The public catalog is [Nexlet-plugins](https://github.com/Cansiny0320/Nexlet-plugins). The client reads its versioned `index.json` and downloads packages only from that repository's GitHub Releases. Entries specify platforms and minimum Nexlet version. Package ID and version must match; a hash field is not required.

Install/update reuse local package validation and run directly after the user clicks, without another permission dialog. Installation records change only after success. Failure keeps the old version and data; development directories are not overwritten and versions are never automatically downgraded. Cached catalogs remain readable offline; a first-load failure offers retry.

Before each new session, marketplace plugins check for updates: at most two seconds for the catalog and ten seconds for download. Compatible versions install automatically. Offline, timeout, invalid package, or a missing requested feature keeps the old version, configuration, persistent secrets, and input. Existing sessions, including detached windows, do not update or restart until reopened. Duplicate launches share the check. Local imports, development directories, and disabled plugins do not auto-update. Exit, disable, or uninstall cancels a pending launch.

## API

Request methods return Promises and reject on failure; show errors in the UI. Event subscriptions return unsubscribe functions.

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

`storage` accesses only this plugin's data. Keys allow letters, digits, `_`, `.`, and `-`, up to 100 characters. Values must support IPC structured cloning and JSON serialization; the total quota is 1 MB per plugin. Do not use `__proto__`, `constructor`, or `prototype`. Uninstall preserves data by default, readable after reinstalling with the same ID.

| Permission | Capability | Limits |
| --- | --- | --- |
| None | `info`, `storage`, `onActivate`, `i18n` | This plugin's isolated data and application language |
| `clipboard.read` | Read current clipboard text | No Nexlet history access; at most 2 Mi characters |
| `clipboard.write` | Write clipboard text | At most 1 Mi characters per call |
| `shell.openExternal` | Open a link in the default browser | HTTP / HTTPS only; URLs with credentials are rejected |

## Runtime isolation

Each plugin uses an isolated in-memory session and sandbox, embedded through WebContentsView or detached. `nodeIntegration` is off and `contextIsolation` is on: no `require`, `process`, or arbitrary IPC. The host verifies the calling webContents, main frame, plugin origin, and installed manifest capabilities on every request.

Resources load from `nexlet-plugin://<id>/...`; their real paths must stay under the plugin root. CSP allows local scripts and styles. Use `<script src="main.js"></script>`, not inline scripts, `eval`, iframes, remote dependencies, inline event handlers, or form submission. Network connections, popups, and browser permission requests are disabled by default.

Inline styles and packaged / `data:` / `blob:` images are allowed. Bundle icons and dependencies. Browser sessions are cleared when plugins close; use `nexlet.storage` for persistence rather than localStorage. Invalid manifests, package limits, and path escapes are rejected on import. Disabling removes commands and ends the session. Crashes or hangs end the affected session and notify the host UI.

A runnable example is in `examples/hello-nexlet`. Host implementation: `src/main/plugins.ts`; bridge: `src/preload/plugin.ts`.

## Content matching and input

Features may declare `matches`. Rules are ORed; conditions within one file rule are ANDed. Existing manifests need no migration.

```json
{"code":"read","name":"读取文本","keywords":["read"],"matches":[
  {"type":"text","minLength":1,"maxLength":10000},
  {"type":"regex","pattern":"^https?://","flags":"i"},
  {"type":"files","extensions":["txt","json"],"fileType":"file","minCount":1,"maxCount":10},
  {"type":"image"}
]}
```

File extensions omit the dot and ignore case. `fileType` is `file` or `directory`. Empty text does not match. Keyword matches precede content matches, with each feature deduplicated. Resource input still allows keyword filtering.

Each feature allows ten rules. Regex patterns are limited to 512 characters, flags to `i/m/s/u`, and input to 10,000 characters. A terminable worker has 20 ms per rule and 200 ms per batch; the host imposes a one-second deadline. At most 128 regexes run. Limits and failures show a launcher message without blocking ordinary search.

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

Input comes from typing, pasting, dropping, the Super panel, or a feature shortcut with selection capture enabled. Read-only tokens are granted only to the chosen plugin session after selecting a feature. Limits: 100 files, 20 MB per file/image, 64 MB across files, 36 million image pixels, and 500,000 text characters. Directories expose metadata only. The host detects file replacement/modification and does not grant arbitrary path reads.

Reentry, exit, disable, update, uninstall, or crash invalidates old tokens; detaching retains them. The input card does not write the system clipboard. New API v1 sources `selection` and `capture` keep the same payload/token contract. Closing the panel does not revoke tokens already delivered. Selection capture prefers native text reading; its copy fallback briefly writes the clipboard and attempts restoration if the version has not changed. Selection stays in memory and is excluded from history unless the user explicitly collects it.

## Session lifecycle

```js
const offReady = nexlet.onReady(() => { /* 本 renderer 初始化一次 */ });
const offEnter = nexlet.onEnter(context => { /* 每次显式启动，包括首次 */ });
const offDetach = nexlet.onDetach(() => { /* 同一 renderer 已移到独立窗口 */ });
const offOut = nexlet.onOut(context => { /* 会话即将退出，可保存少量状态 */ });
```

Initial order: ready → enter. Reactivation: legacy onActivate → enter. ready / enter replay the latest event once per new subscription. Events wait at most 250 ms for callbacks; do not rely on out for long operations, and crashes cannot guarantee it. Returned functions unsubscribe.

`info()` and `onActivate` retain their contract: string payload up to 65,536 characters, empty for resource input; onActivate fires only on reactivation. New plugins should use context/onEnter for full input. ready does not guarantee that the DOM has painted.

Hiding the host keeps sessions. Returning home, switching tools, Escape, disabling, updating, or uninstalling ends them. Detaching transfers the same WebContentsView without refresh or new ready/enter. Launching an already detached plugin focuses it and sends enter. Plugins must not use host-tool IPC. Host dialogs temporarily hide plugin content to keep dialogs visible.

## Controlled networking and encrypted secrets (Nexlet 0.2.7+)

Direct `fetch` remains unavailable. Declare `network.request` and use the bridge. Installed plugins use this declared permission without per-origin prompts or stored address grants. Requests carry no host cookies and do not follow redirects.

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

Only HTTPS and HTTP on `localhost`, `127.0.0.1`, or `[::1]` are allowed. URLs cannot include credentials or fragments. Methods are GET (default) or POST. Headers are limited to `Accept`, `Content-Type`, `Authorization`, and `X-API-Key`. Body limit: 256 KB; response: 2 MB; concurrent requests: four per session. Default timeout is 30 seconds, configurable from 1 to 120,000 ms starting when requested. Exit, disable, uninstall, update, or crash cancels requests; detach preserves them. Undeclared networking is rejected. Legacy `resetPermissions()` remains callable, canceling session requests and clearing old grants; it does not restore prompts and new plugins need no reset UI.

Declare `secrets` to store plugin-isolated keys, with the same name rules as storage:

```js
const { persistent } = await nexlet.secrets.set('apiKey', 'user-provided-key');
const key = await nexlet.secrets.get('apiKey'); // string | null
await nexlet.secrets.set('apiKey', null); // 删除
```

`persistent: true` means system safeStorage encryption was used before writing to disk. Without system encryption, or with Linux `basic_text`, data remains only in the current session and returns `false`; clearly inform users. Detaching retains temporary secrets; exit clears them. Failure to decrypt old data rejects, so allow reentry. Never put keys in ordinary storage, logs, or URLs. Keeping data on uninstall keeps ciphertext; deleting data removes ciphertext and legacy origin grants. This protects local data at rest, but cannot stop an authorized plugin from reading its own keys.

Plugin archives allow 64 MiB compressed, 128 MiB expanded and 32 MiB per file/runtime resource. Marketplace downloads and local installs share these limits. `runtime.compute` permits same-origin fetch, dynamic code, WASM and local Workers without Node, arbitrary files or direct external network access. Other plugins retain their strict CSP.
