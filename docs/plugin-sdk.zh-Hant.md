[简体中文](plugin-sdk.md) · [繁體中文](plugin-sdk.zh-Hant.md) · [English](plugin-sdk.en.md)

# Nexlet Plugin API v1

外掛由 `plugin.json` 和本地 HTML / CSS / JavaScript 組成。使用 Web 標準編寫介面，透過沙箱 preload 提供的 `window.nexlet` 請求宿主能力。內建工具與外部外掛使用不同的 IPC 介面。

## 擴充套件能力

新增獨立 Node.js backend、文件資料庫、視窗與搜尋 UI、檔案/程序、螢幕與輸入、瀏覽器自動化、Sharp/FFmpeg、AI/MCP、賬號與同步適配。具體方法、許可權、執行邊界與樣例見 [SDK 擴充套件文件](plugin-sdk-extensions.zh-Hant.md)，實測範圍見 [驗證記錄](validation/plugin-sdk-2026-10-13.md)。擴充套件沿用 API v1，但尚未釋出，不代表舊版宿主已經支援。

## TypeScript 開發

外掛可以使用 TypeScript 編寫，交付前需要編譯為 JavaScript。外掛倉庫提供 [TS 模板](https://github.com/Cansiny0320/Nexlet-plugins/tree/main/templates/typescript) 和 [獨立 API 型別包](https://github.com/Cansiny0320/Nexlet-plugins/tree/main/sdk)。在 `Nexlet-plugins` 根目錄執行：

```sh
npm ci
npm run package:example
```

匯入 `dist/typescript-example.nexlet`，或載入 `.build/templates/typescript` 開發目錄。`npm run dev -- templates/typescript` 監聽 TS 和靜態資源修改；退出外掛再開啟讀取新檔案，manifest 或許可權改變後需重新匯入。`npm run build` 先執行 `tsc --noEmit`，再透過 esbuild 將 `src/main.ts` 打包成 `main.js`，並複製 HTML/CSS 等靜態資源。`npm run package` 打包 `.build/plugins`，不會將 TS 原始碼或開發依賴裝進外掛包。

本地型別包名為 `@nexlet/plugin-api`，提供 `nexlet`、`window.nexlet` 的全域性宣告，以及 `PluginApi`、`PluginManifest`、`PluginContext` 等匯出型別。目前未釋出到 npm；獨立工程可以從外掛倉庫的 `sdk` 目錄作為本地開發依賴安裝。不要使用本倉庫 `src/shared/types.ts` 中的 `HostApi` 作為外掛型別，該介面僅面向主程式頁面。

型別宣告覆蓋下文已實現的 Nexlet API；TypeScript 不改變外掛的許可權、沙箱或執行能力。

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

`id` 是外掛的穩定身份，用於搜尋命令、資料隔離和升級；必須使用反向域名格式，例如 `org.nexlet.hello`；每段以小寫字母開頭，包含小寫字母、數字或連字元。`main` 必須是包內相對 HTML 路徑。不要使用絕對路徑、`..`、符號連結或遠端入口。

ZIP 包根目錄必須直接包含 `plugin.json`。可直接選擇開發目錄除錯，退出後重新開啟會讀取更新後的檔案；修改 manifest 或許可權後需要重新匯入。每個外掛同一時刻只有一個會話，多條 feature 指令透過啟用通知切換。

`icon` 可選，必須是包內 PNG 相對路徑，不超過 512 KB，寬高不超過 2048 畫素。宿主生成搜尋和已安裝列表中的縮圖。未提供時使用預設外掛圖示。

## 應用語言

`await nexlet.i18n.getLocale()` 返回 `zh-CN`、`zh-Hant` 或 `en`；`nexlet.i18n.onChange(callback)` 訂閱應用語言變化並返回取消訂閱函式，不需要額外許可權。`system.info().locale` 仍表示系統語言。相容舊宿主時應先檢測 `i18n`；先訂閱再讀取，若先收到事件則忽略遲到的首次讀取值。

Manifest、feature 和市場條目可選宣告 `locales`，為不同語言提供 `name`、`description`，市場分類可提供 `category`。預設回退到原欄位，ID、code、版本、路徑、許可權與使用者資料不變。示例和維護約定見 [i18n 說明](i18n.zh-Hant.md)。

## 外掛市場

公開目錄位於 [Nexlet-plugins](https://github.com/Cansiny0320/Nexlet-plugins)。客戶端只從該倉庫的 `index.json` 讀取版本化目錄，從同一倉庫的 GitHub Releases 下載外掛包。條目包含平臺和最低 Nexlet 版本，安裝包 ID / 版本必須一致，不要求 Hash 欄位。

市場安裝、更新複用本地包校驗，使用者點選安裝或更新後直接執行，不再彈出許可權確認框，成功後才替換安裝記錄。失敗保留舊版本與獨立資料；開發目錄不會被市場覆蓋，也不會自動降級。離線時可瀏覽已快取的目錄，首次連線失敗顯示可重試提示。

市場安裝的外掛每次建立新會話前會重新檢查更新：索引檢查最多 2 秒，包下載最多 10 秒，有相容新版時自動更新後開啟，無需確認。斷網、超時、包校驗失敗或新版不包含本次功能時繼續開啟舊版，配置、持久金鑰和啟動輸入保留。已有會話（含分離視窗）再次喚起時不更新或重啟，關閉後下次開啟再檢查；重複啟動合併更新。本地匯入、開發目錄和已停用外掛不自動更新。檢查或下載期間退出、停用、解除安裝會取消待啟動操作。

## API

請求方法返回 Promise，失敗會 reject，應在介面顯示錯誤；事件訂閱返回取消訂閱函式。

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

`storage` 只訪問當前外掛的資料。鍵允許字母、數字、`_`、`.`、`-`，最長 100 個字元；值必須可透過 IPC 結構化複製及 JSON 序列化，每個外掛合計不超過 1 MB。不要使用 `__proto__`、`constructor` 或 `prototype`。解除安裝預設保留資料，使用同一個 `id` 重新安裝後可繼續讀取。

| 許可權 | 可用能力 | 限制 |
| --- | --- | --- |
| 無許可權 | `info`、`storage`、`onActivate` | 當前外掛獨立資料 |
| `clipboard.read` | 讀取當前剪貼簿文字 | 不可讀取 Nexlet 歷史庫；返回文字最多 2 Mi 字元 |
| `clipboard.write` | 寫入剪貼簿文字 | 單次最多 1 Mi 字元 |
| `shell.openExternal` | 在預設瀏覽器開啟連結 | 僅 HTTP / HTTPS；拒絕帶使用者名稱密碼的 URL |

## 執行隔離

每個外掛使用獨立記憶體 session 和 sandbox，預設透過 WebContentsView 內嵌主視窗，可分離為獨立視窗。`nodeIntegration` 關閉，`contextIsolation` 開啟，無 `require`、`process` 或任意 IPC。宿主根據呼叫 webContents、主 frame、外掛來源及安裝時的 manifest 能力宣告檢查每個請求。

資源從 `nexlet-plugin://<id>/...` 讀取。宿主檢查資源真實路徑仍在外掛根目錄中，拒絕越界路徑。CSP 預設只允許本地指令碼和樣式：請用 `<script src="main.js"></script>`，不要使用內聯指令碼、`eval`、iframe、遠端依賴、內聯事件處理器或表單提交。網路連線、視窗彈出和瀏覽器許可權請求預設禁用。

樣式允許內聯，圖片允許包內檔案及 `data:` / `blob:`。需要圖示和依賴時，將它們隨包提供。外掛會話結束後清理瀏覽器 session；需要跨次執行儲存的資料請使用 `nexlet.storage`，不要依賴 localStorage。

安裝包限制、非法 manifest 和越界檔案都會在匯入時被拒絕。外掛停用後移出搜尋結果並結束會話。外掛程序崩潰或無響應時結束該外掛會話，並通知主介面。

完整可執行示例位於 `examples/hello-nexlet`；宿主實現位於 `src/main/plugins.ts`，橋接定義位於 `src/preload/plugin.ts`。


## 內容匹配與輸入

feature 可選新增 `matches`，多條規則取「或」，單條檔案規則中的條件取「且」。舊 manifest 無需遷移。

```json
{"code":"read","name":"读取文本","keywords":["read"],"matches":[
  {"type":"text","minLength":1,"maxLength":10000},
  {"type":"regex","pattern":"^https?://","flags":"i"},
  {"type":"files","extensions":["txt","json"],"fileType":"file","minCount":1,"maxCount":10},
  {"type":"image"}
]}
```

副檔名不含點且不區分大小寫；`fileType` 為 `file` 或 `directory`。空文字不觸發內容匹配。關鍵詞命中優先，內容匹配隨後，同 feature 去重。資源輸入可繼續鍵入關鍵詞篩選。

每 feature 最多 10 條規則；正則模式最多 512 字元，flags 只接受 `i/m/s/u`，僅匹配長度不超過 10000 字元的輸入。正則在可終止 worker 中執行，每條 20 ms、批次 200 ms，宿主另設 1 秒期限；總共最多執行 128 條正則，超限或失敗在啟動器顯示提示，不阻塞普通搜尋。

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

輸入由使用者鍵入、貼上、拖入，或透過超級面板 / 已開啟「帶入當前選區」的功能快速鍵獲取，僅在選擇功能後給選中的外掛會話授予只讀 token。最多 100 個檔案，單檔案/圖片 20 MB、檔案合計 64 MB、圖片 3600 萬畫素；文字最多 50 萬字元。目錄只提供元資訊。宿主檢測檔案替換和修改，不提供任意路徑讀取。再次進入、退出、禁用、更新、解除安裝或崩潰後，舊 token 失效。分離保留原 token。輸入卡片本身不寫系統剪貼簿。`from: "selection"` 和宿主截圖的 `from: "capture"` 是 SDK v1 的新增來源值，payload 與資源 token 合同不變；面板關閉不撤銷已經交給外掛的 token。選區獲取優先使用系統原生文字讀取，複製兜底會短暫寫入系統剪貼簿並在版本未變化時嘗試恢復；選區內容只保留在記憶體，預設不進入 Nexlet 歷史。使用者明確選擇「收進剪貼簿」後才主動收錄。

## 會話生命週期

```js
const offReady = nexlet.onReady(() => { /* 本 renderer 初始化一次 */ });
const offEnter = nexlet.onEnter(context => { /* 每次显式启动，包括首次 */ });
const offDetach = nexlet.onDetach(() => { /* 同一 renderer 已移到独立窗口 */ });
const offOut = nexlet.onOut(context => { /* 会话即将退出，可保存少量状态 */ });
```

首次順序為 ready → enter，再次啟動為舊 onActivate → enter。ready / enter 支援訂閱時回放最近事件；一個訂閱函式只呼叫一次回放。每個事件最多等待回撥 250 ms，外掛不應依賴 out 完成長耗時操作；崩潰時無法保證 out 回撥。事件返回的函式取消訂閱。

`info()` 和 `onActivate` 保留舊合同：payload 始終為字串（最多 65536 字元，資源輸入為空字串），onActivate 僅再次啟用觸發。新外掛使用 context/onEnter 接收完整輸入，不假定 ready 時 DOM 已繪製完成。

隱藏主視窗保留會話；返回首頁、切換工具、Escape 退出、禁用/更新/解除安裝結束會話。分離轉移同一個 WebContentsView，不重新整理頁面，不重新 ready/enter；再次啟動已分離外掛聚焦它併傳送新 enter。外掛不得呼叫宿主工具的 IPC。宿主彈出對話方塊時暫時隱藏外掛內容，避免覆蓋確認介面。

## 受控網路與加密金鑰（Nexlet 0.2.7+）

外掛仍不能直接 `fetch`，需在 manifest 宣告 `network.request`，再呼叫宿主橋接。已安裝外掛按宣告直接使用聯網能力，不再逐 origin 彈窗確認或記錄地址授權。請求不會攜帶宿主 Cookie，不允許重定向。

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

只支援 HTTPS，以及 `localhost` / `127.0.0.1` / `[::1]` 的 HTTP 地址。URL 不得含賬號、密碼或 fragment；方法為 GET（預設）或 POST。請求頭僅支援 `Accept`、`Content-Type`、`Authorization`、`X-API-Key`。正文最多 256 KB，響應最多 2 MB，每會話最多 4 個請求。預設超時 30 秒，可設定 1–120000 ms；超時從發起請求開始。退出、停用、解除安裝、更新或崩潰會取消該會話請求；分離視窗保留會話。未宣告 network.request 的外掛不能使用橋接。

金鑰需宣告 `secrets` 許可權，按外掛隔離，名稱規則與 storage 相同：

```js
const { persistent } = await nexlet.secrets.set('apiKey', 'user-provided-key');
const key = await nexlet.secrets.get('apiKey'); // string | null
await nexlet.secrets.set('apiKey', null); // 删除
```

`persistent: true` 表示經系統 safeStorage 加密後落盤；無可用系統加密或 Linux 使用 `basic_text` 時，僅在當前外掛會話內儲存並返回 `false`，外掛應明確提示使用者。分離視窗保留臨時金鑰，退出會清除；無法解密舊資料會 reject，外掛應允許重新填寫。不要把金鑰放入普通 `storage`、日誌或 URL。解除安裝保留資料時也保留密文，選擇清理資料則同時清除密文與舊版遺留的 origin 授權。此能力是本機靜態儲存保護，不能阻止已獲授權的外掛讀取自己的金鑰。

外掛壓縮檔最多 64 MiB，解壓合計 128 MiB，單個檔案/執行資源 32 MiB；市集下載與本機安裝遵循相同限制。`runtime.compute` 允許同源資源 fetch、動態程式碼、WASM 與本機 Worker，不開放 Node、任意檔案或直接外網存取。普通外掛維持原有嚴格 CSP。
