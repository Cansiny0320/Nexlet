[简体中文](README.md) · [繁體中文](README.zh-Hant.md) · [English](README.en.md)

# Nexlet 官網

正式地址：<https://nexlet.cansiny0320.chatgpt.site>

官網是獨立的 `website/` 工程。2026-10-14 已按批准方案遷移為 React + TanStack Start SSR；本次為本地實現與驗收，線上仍以實際部署版本為準。

## 技術棧與執行

- Node.js 24.19.0（最低 24.11.0）、pnpm 12.11.2、TypeScript 7.0.2。
- React 19.2.6、TanStack Start 1.169.1、TanStack Router 1.170.44。
- Vite+ 1.1.0（內含 Vite 8.3.3）、Sites Vite plugin 0.2.0、Cloudflare Vite plugin 1.37.1。
- Tailwind CSS 4.2.1、shadcn/ui base-nova 配置、Base UI 1.9.0、Lucide React。保留 Nexlet 現有視覺主題，Tailwind 不注入會改變原佈局的 Preflight。
- Oxlint、Oxfmt、Vitest 5.0.3、Testing Library；Cloudflare Workers + 靜態資源。

在 `website/` 中執行：

```powershell
pnpm install --frozen-lockfile
pnpm dev
pnpm verify
pnpm format:check
pnpm test:browser
```

使用 `packageManager` 指定的 pnpm 12.11.2；沒有該版本時可用 `npx --yes pnpm@12.11.2 <命令>`。`verify` 包含 lint、型別檢查、單元/元件測試與構建。首次 checkout 已包含生成路由樹，構建或開發服務在路由變化時更新它。

`build` 寫入 `dist/client`、`dist/server` 和 `dist/.openai/hosting.json`；Cloudflare 外掛同時寫本地 `.wrangler` 狀態。`test:browser` 自動啟動**構建後的 Worker**、執行 Chrome headless 測試並關閉程序，結果與截圖寫入忽略的 `.qa/`。先執行 build/verify。可用 `BROWSER_CHANNEL=msedge` 選擇已安裝的 Edge，或傳 `SITE_URL` 使用已有預覽。測試攔截 GitHub Release 與 Clipboard API，不下載安裝包、不改系統剪貼簿。`format` 會修改檔案；其餘檢查不自動修復原始碼。

## 原始碼組織與行為

- `src/routes/`：首頁、下載、外掛開發和根佈局；`src/router.tsx` 保留原路徑及尾斜槓。
- `src/pages/`：React 頁面內容；`src/components/`：共享佈局、Base UI 下載選單、複製按鈕和版本展示。
- `src/components/site-provider.tsx`：同一頁面共享下載狀態。服務端與首次客戶端渲染使用相同回退；瀏覽器掛載後識別平臺、查詢版本。
- `src/lib/platform.ts`、`src/lib/releases.ts`：純平臺判斷、釋出校驗及超時請求。
- `src/lib/seo.ts`、`public/robots.txt`、`public/sitemap.xml`：SEO；`site.json` 儲存正式 origin、倉庫和事實核對日期。
- `src/styles/`：原有佈局樣式和 Tailwind / base-nova token 整合；`public/assets/`：圖片、字型、圖示與許可證。
- `src/server.ts`：TanStack Start 的 Worker 入口。沒有登入、資料庫、財務依賴或 oRPC。

`downloads.json` 儲存已核實的完整回退版本和下載直鏈。首頁和下載頁在瀏覽器載入時向官方 GitHub latest Release 請求一次，5 秒超時，不攜帶認證、不自動重試。只有正式釋出的 Windows x64 便攜 EXE、macOS ARM64/x64 DMG 和 SHA256SUMS.txt 全部匹配同一版本，才整體更新版本、下載、更新日誌和校驗連結。失敗仍可下載；客戶端路由切換後也保留已確認版本，避免降級到更早版本。無 JavaScript 時保留靜態回退直鏈。

未知平臺或無法可靠判斷的架構進入手動選擇，macOS Intel UA 不代表實際 Intel 硬體。手動選擇優先於晚到的架構識別，首頁兩處控制元件共享選擇；切換選項不會開始下載。移動導航、選單和複製反饋由 React 管理；Base UI 提供選單焦點、方向鍵、Escape 和外部點選關閉。

三頁均輸出完整 SSR HTML，保留 canonical、OG、JSON-LD、公開 robots 和 sitemap；不存在的路徑返回 HTTP 404 與 noindex。不要編造評分、下載數量或未釋出功能。

## 資源與視覺

保留 `designs/2026-10-12-ui-v2/` 的設計基準與現有頁面視覺。產品拼貼是功能示意；`launcher.png` 等保留既有截圖身份。通用圖示使用 Lucide React；品牌路徑從 Simple Icons 11.0.0 原樣遷入 `src/components/icon.tsx`，原始 viewBox 與 CC0 許可證保留。

字型仍為本地 Noto Sans SC 和裝飾用 LXGW WenKai 子集，許可證隨資源分發。可用 `scripts/build-font.py`、`scripts/build-note-font.py` 與 `fonttools[woff]` 重建，日常構建不需要 Python。

## Sites 釋出邊界

保留既有 `project_id`：`appgprj_6acbbb32d78881919f324dcdf9ee6640`。`.openai/hosting.json` 已移除靜態站的 `static` 配置，構建產物改為 Worker；不要重新註冊 Site。原始碼與本地構建驗收不代表線上已釋出。

釋出需要單獨授權。獲得授權後，沿用 Sites 官方 `site-workflow.mjs` 的原始碼同步和打包流程；使用 `build-site.mjs` 執行本工程 build，儲存其精確 commit/archive，保持既有 public audience，最後確認部署 succeeded。根倉庫提交與 Sites source SHA 不要求相同，但網站原始碼應一致。不要把根倉庫、桌面應用或本地 `.qa/`、`node_modules/`、`.wrangler/` 上傳到 Sites 原始碼。

舊靜態原始碼及 manifest 可從遷移前 Git 版本恢復；若後續釋出，生產回滾可使用原 Sites 版本。本次沒有 commit、push 或部署。

設計、計劃和驗收：`docs/specs/2026-10-14-tanstack-migration.md`、`docs/plans/2026-10-14-tanstack-migration.md`、`docs/validation-2026-10-14.md`。其他文件記錄的是此前靜態官網的歷史狀態。

## 三語言

簡體保留 `/`、`/download/`、`/plugins/`；English 使用 `/en/` 字首，繁體使用 `/zh-Hant/`。URL 決定 SSR 與首屏語言，各請求翻譯例項隔離；頁頭切換保留頁面。九個頁面提供各自 title、description、canonical、OG、JSON-LD、hreflang 與 sitemap。詞條位於 `src/lib/locales/`，Provider 位於 `site-language.tsx`，公開文件連結按語言選擇。維護約定見 [i18n 說明](../docs/i18n.zh-Hant.md)。

繁體介面另提供 Noto Sans TC 子集，源自 Google Fonts 的 `ofl/notosanstc`，許可證為 `public/assets/OFL-NotoSansTC.txt`。重建使用 `python scripts/build-font.py <NotoSansTC.ttf> zh-Hant`；兩個字型指令碼會包含語言 JSON 中的字元。
