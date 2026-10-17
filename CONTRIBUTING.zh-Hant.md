[简体中文](CONTRIBUTING.md) · [繁體中文](CONTRIBUTING.zh-Hant.md) · [English](CONTRIBUTING.en.md)

# 參與 Nexlet

歡迎提交問題、修復和外掛。涉及新功能或資料變化時，先說明使用場景、預期行為與相容性，再開始大範圍實現。

## 開發檢查

使用 Node.js 24.19 LTS，執行 `pnpm install --frozen-lockfile`，透過 `pnpm start` 啟動。提交前執行 `pnpm check`、`pnpm test`；桌面行為改動還需在 Windows 執行 `pnpm test:e2e`。測試透過不代表所有平臺的系統許可權流程都已驗證，請在 PR 中寫明實際平臺和範圍。

Vite+ 統一建置、測試、格式化、lint 與 TypeScript 7 型別檢查。`pnpm check` 只檢查，不改寫檔案；`pnpm format` 格式化第一方原始碼，`pnpm lint:fix` 修復重複匯入。`website/` 保持可獨立安裝，使用自己的命令。

不要提交 `node_modules`、使用者資料庫、剪貼簿、臨時測試目錄或私人檔案。網站產物由 `website/` 自己的規則管理。不要用真實個人資料作為測試夾具或截圖。

## 實現約定

- 宿主系統能力集中在 `src/main`，介面只透過受限 preload 呼叫。
- 外部外掛的 manifest、許可權、來源和路徑邊界必須在宿主驗證。
- 先確認缺陷根因，優先增加能證明使用者行為的迴歸測試。
- 複用現有型別與 helper，避免將無關重構混入功能提交。
- 修改資料格式時相容舊資料，說明遷移和回滾方式。
- 同步維護三語言，保留使用者內容和標識，遵循 [i18n 說明](docs/i18n.zh-Hant.md)。

外掛可向 [Nexlet-plugins](https://github.com/Cansiny0320/Nexlet-plugins) 提交，協議見 [Plugin API v1](docs/plugin-sdk.zh-Hant.md)。

提交的程式碼按本專案 MIT 許可證提供；引入第三方元件時保留其原許可證。
