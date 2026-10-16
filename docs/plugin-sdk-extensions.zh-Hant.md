[简体中文](plugin-sdk-extensions.md) · [繁體中文](plugin-sdk-extensions.zh-Hant.md) · [English](plugin-sdk-extensions.en.md)

# Nexlet SDK 擴充套件能力

本擴充套件沿用 `apiVersion: 1`，保持原介面不變，以 Nexlet API 覆蓋桌面外掛的能力分類。**不提供 uTools 外掛原始碼、介面名稱或安裝包相容層。** 這些改動尚未釋出；舊正式版宿主不認識新增許可權。公開合同位於 `sdk/index.d.ts` 和 `src/shared/plugin-api.ts`，外掛倉型別由 `node scripts/sync-plugin-sdk.mjs` 生成。

## 許可權和執行邊界

| manifest 許可權 | 能力 |
| --- | --- |
| `files` | 本機絕對路徑讀寫、目錄、檔案操作、檔案對話方塊、圖示、檔案拖拽 |
| `process` | 執行本機程式，可選擇環境變數與工作目錄；沒有 shell 字串插值 |
| `backend` | 外掛包內的獨立 Node.js 後臺、RPC、持久排程 |
| `windows` | 宿主視窗、外掛子視窗及訊息 |
| `notifications` | 系統通知與點選事件 |
| `browser` | 獨立瀏覽器、頁面求值/輸入、cookie、代理、快取；下載與檔案輸入另需 `files` |
| `screen` | 顯示器、截圖來源、截圖、區域選擇、取色、座標 |
| `input.simulate` | 鍵盤、滑鼠、回貼；剪貼簿讀寫仍需原許可權 |
| `media` | Sharp 影像 worker、FFmpeg；FFmpeg 需要 `media`、`files`、`process` 以及明確指定 `executable` |
| `ai` | 配置模型 provider、模型列表、chat、流式輸出和工具呼叫片段 |
| `services` | 配置賬號/授權/checkout/同步 provider |
| `tools` | 註冊 JSON Schema 校驗的工具並呼叫後臺方法，另需 `backend` |
| `mcp` | 顯式啟動本機 MCP HTTP 服務，另需 `tools`、`backend` |
| `runtime.compute` | 本機運算（動態程式碼、WASM 與本機 Worker）；保留沙箱，無 Node 或直接外網存取 |

舊的 `clipboard.read`、`clipboard.write`、`shell.openExternal`、`network.request`、`secrets` 繼續有效。獨立 KV、文件資料庫、當前外掛的動態功能和搜尋 UI 不需額外許可權。

前端與外掛子視窗保留 sandbox、contextIsolation、無 Node integration。Node backend 和 `process` 是可信原生代碼能力，**獨立程序用於生命週期與崩潰隔離，不是 OS 安全沙箱**；這些外掛能夠訪問當前使用者的本地資源。許可權顯示在已安裝外掛詳情。遠端瀏覽器不注入 Nexlet API，頁面不能獲得外掛 bridge。資源控制代碼由實際呼叫方會話持有，其他外掛或重新開啟的會話不能複用。

## 任務與後臺

長任務傳入唯一 `id`，可用 `tasks.cancel(id)` 取消。同一會話最多 32 個併發任務，超時範圍 1–3,600,000 ms；一般預設 30 秒，媒體 60 秒，AI 120 秒。`tasks.onProgress`、`ai.onChunk` 等均返回取消訂閱函式。會話關閉後停止投遞事件。

```ts
const off = nexlet.tasks.onProgress(({ id, value }) => console.log(id, value));
const result = await nexlet.backend.call({ id: 'job', method: 'hash', args: { text: 'hello' } });
await nexlet.tasks.cancel('job');
off();
```

Manifest 增加 `"backend": "backend.cjs"` 和 `backend` 許可權。包內入口禁止路徑越界或符號連結。後臺匯出 `handlers` 物件：

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

取消任一後臺呼叫會終止該外掛後臺程序，**同一程序中的並行呼叫也會失敗**，後續呼叫自動重啟。關前端取消其 RPC；無呼叫的後臺可繼續駐留，持久排程不依賴前端。停用、解除安裝、更新、宿主退出停止後臺。`dataDirectory` 按外掛隔離，解除安裝勾選刪除資料才刪除。

```ts
await nexlet.schedules.set({ id: 'refresh', method: 'refresh', at: Date.now() + 60_000, intervalMs: 60_000 });
const jobs = await nexlet.schedules.list(); // 包含 lastRun / lastError
await nexlet.schedules.remove('refresh');
```

排程每秒檢查一次，每外掛最多 100 個，間隔至少 1 秒，每次執行最多 5 分鐘。關機期間不執行，重啟後到期任務補執行一次；執行前持久化下一次截止時間，避免連續補跑。一次任務完成後保留狀態，`at` 為最大安全整數。需要嚴格業務冪等時，後臺自行使用業務冪等鍵。

## 文件、附件與 KV

原 `storage.get/set` 之外新增 `keys/remove`，原配額仍為 1 MB。文件資料庫單文件 1 MB、單附件 10 MB、每外掛共 50 MB。建立時不傳 `rev`；更新和刪除必須攜帶當前 `rev`，衝突報 `document conflict`，不會靜默覆蓋。`bulk` 最多 500 個且原子提交。附件寫入/刪除也改變文件 revision。

```ts
const old = await nexlet.database.get('settings');
const doc = await nexlet.database.put({ id: 'settings', rev: old?.rev, value: { theme: 'dark' } });
await nexlet.database.putAttachment(doc.id, doc.rev, 'preview', 'image/png', pngBytes);
const attachment = await nexlet.database.getAttachment('settings', 'preview');
const page = await nexlet.database.query({ prefix: 'setting', after: '', limit: 100 });
```

## 視窗、指令與搜尋

`window.info/show/hide/focus/set/close/detach` 操作當前視窗；傳入 `window` 控制代碼操作自己的子視窗。`set` 支援 bounds、alwaysOnTop、fullScreen、resizable、opacity、title。主外掛 `close` 會關閉外掛會話，不退出宿主。子視窗只載入包內 HTML，繼承同外掛能力，透過 `context()` 獲取當前輸入。

```ts
const child = await nexlet.window.create({ entry: 'child.html', width: 640, height: 480 });
nexlet.window.onMessage(({ from, message }) => console.log(from, message));
await nexlet.window.send({ selected: 'one' }, child);
// child.html 中：await nexlet.window.send({ accepted: true }); // 发送给父窗口
await nexlet.window.close(child);
```

`commands.set` 替換外掛動態功能列表（最多 30 個），不能覆蓋 manifest 的靜態 code。列表持久儲存並加入宿主搜尋；`commands.redirect` 請求開啟某外掛功能，接收 `{pluginId,code,payload?}`，返回表示已接受，非同步啟動失敗由宿主顯示。

```ts
await nexlet.commands.set([{ code: 'recent', name: '最近记录', keywords: ['recent'] }]);
await nexlet.search.set({ placeholder: '检索记录', text: '', visible: true });
nexlet.search.onChange(async ({ text }) => {
  await nexlet.search.results([{ id: '1', title: `搜索 ${text}`, description: '回车或点击结果' }]);
});
nexlet.search.onSelect(({ id }) => { void nexlet.search.results([]); });
```

`search.results` 最多 100 條，非空時宿主結果區域覆蓋外掛檢視；清空後恢復。輸入框隨外掛分離遷移。`dialogs.message/open/save` 提供系統對話方塊；`notifications.show` 與 `onClick` 提供系統通知，會話關閉時收回通知。

## 系統、檔案、輸入與螢幕

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

檔案單次讀寫最多 16 MB；`list/stat/mkdir/rename/copy/remove`、`system.fileIcon/openPath/reveal/trash` 操作本機路徑，`remove` 僅刪除檔案，`trash` 使用系統回收站。程序輸出最多 8 MB，取消時終止程序組（Windows 使用 taskkill）。

圖片剪貼簿使用 PNG bytes，`clipboard.readImage/writeImage/readFiles/writeFiles` 補充文字介面。`input.paste()` 回貼到宿主已記住的外部應用，找不到目標則報錯；`input.drag({files})` 應在外掛拖拽手勢中呼叫。`input.key({code,modifiers})` 的 code 是 macOS virtual key、Windows virtual key、Linux X11 keycode。`input.mouse` 支援 move/click/doubleClick/down/up/scroll，座標採用桌面 DIP。

`screen.displays/cursor/convertPoint` 提供顯示器與座標；截圖 `region` 使用返回影象的畫素座標，互動選擇返回桌面 DIP 區域。螢幕和輔助功能依賴 macOS 系統授權；不會自動修改系統設定。Linux 輸入需要 X11 與 xdotool，Wayland 明確報不支援。通知、螢幕來源和視窗截圖也受具體桌面環境限制。

## 瀏覽器與媒體

```ts
const browser = await nexlet.browser.create({ visible: false });
await nexlet.browser.perform({ id: 'open', browser, action: { type: 'navigate', url: 'https://example.com' } });
await nexlet.browser.perform({ id: 'wait', browser, action: { type: 'wait', selector: '#ready' } });
const title = await nexlet.browser.perform({ id: 'read', browser, action: { type: 'evaluate', script: 'document.title' } });
const pdf = await nexlet.browser.perform({ id: 'pdf', browser, action: { type: 'pdf' } });
await nexlet.browser.close(browser);
```

瀏覽器每前端會話最多 8 個，只導航 HTTP(S)，所有彈窗預設拒絕，網頁系統許可權預設拒絕。支援 click/type/input、檔案 input、下載、截圖/PDF、cookie、userAgent、代理和快取。瀏覽器 cookie/快取按外掛持久隔離；解除安裝刪除資料會清空。超時或取消操作會關閉對應瀏覽器。下載必須指定不存在的絕對路徑，非 API 發起的下載會阻止。

```ts
const resized = await nexlet.media.image({ id: 'resize', data: pngBytes, operations: [{ op: 'resize', args: [320, 200] }], format: 'webp' });
const metadata = await nexlet.media.image({ id: 'metadata', data: pngBytes, metadata: true });
await nexlet.media.ffmpeg({ id: 'convert', executable: ffmpegPath, args: ['-i', sourceFile, '-n', targetFile] });
```

Sharp 在 utility process 執行，支援縮放、旋轉、裁剪、邊框、翻轉、背景、模糊、銳化、閾值、色彩/通道操作及 PNG/JPEG/WebP/AVIF/TIFF/GIF 輸出。輸入/輸出最多 32 MB，輸入限制 1 億畫素。`operations[].args` 使用相應 [Sharp 官方引數](https://sharp.pixelplumbing.com/api-operation/)。FFmpeg 透過獨立程序執行，`tasks.onProgress` 返回 stdout/stderr；進度啟用 `-progress pipe:1`。宿主不再內建 FFmpeg；必須透過 `executable` 提供本機路徑，並同時宣告 `media`、`files`、`process` 權限。省略路徑時明確報錯。

## AI、工具與 MCP

```ts
await nexlet.ai.configure({ baseUrl: 'https://provider.example/v1', apiKey: userKey });
const models = await nexlet.ai.models({ id: 'models' });
const unsubscribe = nexlet.ai.onChunk(({ id, chunk }) => console.log(id, chunk));
const reply = await nexlet.ai.chat({ id: 'chat', stream: true, request: { model: models[0].id, messages: [{ role: 'user', content: '你好' }] } });
unsubscribe();
```

使用 OpenAI-compatible `/models` 和 `/chat/completions`。非流式返回 completion，流式返回 `{content,toolCalls}` 並推送原始 chunk。`request.tools` 可傳函式工具定義；工具呼叫由外掛顯式執行，不自動執行模型返回的任意操作。SSE 未收到 `[DONE]` 就斷開會報錯。單次請求 2 MB、響應 8 MB，拒絕跨站重定向。

```ts
await nexlet.tools.register({ name: 'hash', description: '计算文本 SHA-256', method: 'hash', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } });
const result = await nexlet.tools.call({ id: 'hash-call', name: 'hash', args: { text: 'hi' } });
const connection = await nexlet.mcp.start(); // {url,token}；显式启动才监听
await nexlet.mcp.stop();
```

工具註冊每外掛最多 100 個，引數用 JSON Schema 校驗，僅支援 schema 內部 `$ref`。MCP 為 [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports) 的無狀態 JSON 響應模式，版本 2025-06-18，支援 initialize/ping/tools/list/tools/call/cancelled。僅監聽 `127.0.0.1` 隨機埠，使用 `Authorization: Bearer <token>`，拒絕 Origin 與錯誤 Host，GET 返回 405。每個服務僅暴露所屬外掛的工具，關閉前端即停止；不會自動寫入其他 MCP 客戶端配置。

## 賬號、授權、checkout 與同步服務合同

`services.configure({baseUrl,apiKey?})` 配置外掛服務。服務和 AI 的 key 獨立儲存於已有加密金鑰儲存；系統加密不可用時明確返回 `persistent:false`，僅當前會話保留。改變 base URL 不會自動把舊 key 傳送到新地址。`configure(null)` 清除該配置。`status()` 只報告配置，不意味著服務已連通。

| SDK | HTTP 合同 | 必要返回欄位 |
| --- | --- | --- |
| `account({id})` | GET `/account` | `{user:null}` 或 `{user:{id,...}}` |
| `login({id})` | POST `/auth/start`，body `{pluginId}` | `{url,sessionId}`；外掛自行明確開啟登入頁 |
| `loginStatus({id,sessionId})` | POST `/auth/status` | `{status:'pending'|'expired'}` 或 `{status:'complete',token}`；token 被加密儲存，不返回前端 |
| `license({id,product})` | GET `/license?product=...` | `{active:boolean,...}` |
| `checkout({id,product,idempotencyKey})` | POST `/checkout` | `{url:'https://...',...}`；僅建立 checkout，不自動支付 |
| `syncGet({id,key})` | GET `/sync/<encoded key>` | `{value,version:string|null}` |
| `syncPut({id,key,value,expectedVersion,idempotencyKey})` | POST `/sync/<encoded key>` | `{version:string}`；版本不匹配服務必須返回 HTTP 409 |

```ts
const current = await nexlet.services.syncGet({ id: 'get', key: 'settings' });
await nexlet.services.syncPut({ id: 'save', key: 'settings', expectedVersion: current.version, idempotencyKey: crypto.randomUUID(), value: { theme: 'dark' } });
```

這些是已實現並經本地 fixture 驗證的適配協議，不是已經部署的 Nexlet 賬號、支付、授權或雲端儲存服務。實際供應商需要實現上述合同；付款、訂單真實性、業務冪等與授權最終判定由服務負責。本次沒有註冊服務、建立真實 checkout 或發生交易。

驗證範圍見 [SDK 驗證記錄](validation/plugin-sdk-2026-10-13.md)。

## 本機運算與結果返回

外掛壓縮檔最多 64 MiB，解壓合計 128 MiB，單個檔案/執行資源 32 MiB；市集下載與本機安裝遵循相同限制。`runtime.compute` 允許同源資源 fetch、動態程式碼、WASM 與本機 Worker，不開放 Node、任意檔案或直接外網存取。普通外掛維持原有嚴格 CSP。

`search.returnToLauncher(text)` 關閉目前外掛並將非空文字送回啟動器繼續處理，最多 500000 字元，不需額外權限。`clipboard.snapshot()` 需要 `clipboard.read`，返回繫結工作階段的一次性 token 或 `null`；`clipboard.writeTextIfUnchanged(token,text)` 需要讀寫兩項權限，僅在剪貼簿未改變且 token 仍有效時寫入，返回 boolean。新快照取代舊 token，使用或關閉工作階段後失效。
