[简体中文](README.md) · [繁體中文](README.zh-Hant.md) · [English](README.en.md)

<p align="center"><img src="assets/icon.png" width="76" alt="Nexlet"></p>
<h1 align="center">Nexlet</h1>
<p align="center">按下快速鍵，把常用工具帶到手邊。</p>
<p align="center">
  <a href="https://github.com/Cansiny0320/Nexlet/actions/workflows/release.yml"><img src="https://github.com/Cansiny0320/Nexlet/actions/workflows/release.yml/badge.svg" alt="Build and Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-6875e9" alt="Windows, macOS and Linux">
</p>
<p align="center">
  <a href="https://github.com/Cansiny0320/Nexlet/releases">下載與發行記錄</a> ·
  <a href="https://github.com/Cansiny0320/Nexlet-plugins">外掛市場倉庫</a> ·
  <a href="docs/plugin-sdk.zh-Hant.md">外掛開發</a> ·
  <a href="website/README.zh-Hant.md">官網</a>
</p>

Nexlet 是一個開源桌面工具箱，提供應用與快捷方式搜尋、剪貼簿、計算草稿、JSON 工具和可擴充套件外掛。主視窗保留搜尋、最近使用和固定工具，常用工具可以分離成獨立視窗。

本文介紹當前原始碼與介面；下載安裝包時，請以對應的 [發行說明](https://github.com/Cansiny0320/Nexlet/releases) 為準。

![Nexlet 啟動器](docs/screenshots/zh-Hant/launcher.png)

## 幾個隨手就能完成的操作

| 輸入或操作 | Nexlet 會做什麼 |
| --- | --- |
| `Alt+Space` 後輸入應用名、拼音或首字母 | 查詢應用、系統快捷方式、網頁與外掛指令 |
| 輸入 `128*3` | 顯示結果 `384`，可繼續在計算草稿裡逐行計算 |
| 開啟「剪貼簿」 | 搜尋文字、圖片和檔案歷史，收藏、複製或回貼到之前的應用 |
| 開啟「JSON 工具」 | 雙欄編輯與樹形格式化；對比兩份 JSON，紅色表示刪除，綠色表示新增 |
| 使用「檔案搜尋」 | Windows 使用內建 Everything，macOS 使用系統 Spotlight，搜尋本機檔案、瀏覽資料夾並檢視檔案資訊 |
| 開啟「外掛管理」 | 瀏覽 GitHub 外掛市場，安裝、更新或管理本地外掛 |

其他預裝工具包括時間戳、URL / Base64、UUID 和網頁快開。預裝工具隨應用提供，離線也能開啟。

<table>
<tr><td><img src="docs/screenshots/zh-Hant/scratchpad.png" alt="逐行計算草稿"></td><td><img src="docs/screenshots/zh-Hant/clipboard.png" alt="剪貼簿歷史"></td></tr>
<tr><td align="center">續算、備註、鎖定和自動儲存</td><td align="center">文字、圖片、檔案與收藏</td></tr>
<tr><td><img src="docs/screenshots/zh-Hant/json-diff.png" alt="JSON 紅綠差異對比"></td><td><img src="docs/screenshots/zh-Hant/marketplace.png" alt="外掛市場範例清單"></td></tr>
<tr><td align="center">JSON 對比與鍵順序選項</td><td align="center">瀏覽、安裝和更新外掛</td></tr>
</table>

## 下載和開始使用

構建產物位於 [GitHub Releases](https://github.com/Cansiny0320/Nexlet/releases) 或透過檢查的 [Actions 執行記錄](https://github.com/Cansiny0320/Nexlet/actions/workflows/release.yml)。標籤構建先生成 Release 草稿；草稿公開發布前，開發預覽包從 Actions artifacts 獲取，需要登入 GitHub。

| 平臺 | 產物 | 當前驗證範圍 |
| --- | --- | --- |
| Windows x64 | 安裝版和單檔案便攜 `.exe` | 本機整合測試、真實外部回貼、便攜包啟動檢查 |
| macOS Apple Silicon | arm64 `.dmg` | 原生 CI 構建與打包後啟動檢查 |
| macOS Intel | x64 `.dmg` | 原生 CI 構建與打包後啟動檢查 |
| Linux x64 / arm64 | AppImage 和 `.deb` | 新增本地構建與 X11 smoke；真實 GNOME/KDE Wayland 待驗收，見 [Linux 說明](docs/linux.zh-Hant.md) |

Windows 可使用安裝版，或直接執行便攜 EXE。首次解壓會稍慢，關閉主視窗後程式保留在托盤，右鍵托盤可退出。Windows 包未做數字簽名。macOS 正式包使用固定簽名身份以支援後續更新，尚未完成 Developer ID 簽名和 Apple 公證。macOS arm64 已有本機回貼與同證書升級保留輔助功能授權的驗證記錄；這不代表所有 Mac 環境均已驗收，詳見 [驗證記錄](docs/validation.md#macos-本机固定签名验证2026-10-12)。

Linux 安裝、依賴和桌面環境限制見 [Linux 使用說明](docs/linux.zh-Hant.md)。本次新增 Linux 支援尚未釋出。

預設使用 `Alt+Space` 喚起（macOS 為 `Option+Space`）。點選啟動器右上角 Nexlet 圖示開啟設定；若快速鍵被佔用，可在「全域性喚起」中更換，或使用推薦的共存快速鍵 `Ctrl+Alt+Space`（macOS 為 `Control+Option+Space`）；Nexlet 會提示衝突，不會修改其他程式的配置。獨立工具視窗支援置頂，主啟動器不顯示置頂按鈕。

設定中提供「開機自啟動」開關，開啟後隨系統登入在後臺執行。Windows 便攜版請放在固定位置後再開啟；移動 EXE 後需要重新開啟開關。狀態直接讀取系統設定，不會在首次執行時自動登記。macOS 如需系統批准，會在設定頁提示。

便攜版更新時，先從托盤選擇「退出 Nexlet」，再執行新版 EXE；直接雙擊新版會喚起仍在執行的舊例項。JSON 臨時輸入請在退出前複製保留。標題欄左側手柄、工具名稱及空白處可拖動視窗，按鈕和輸入框保留原有互動。

### 介面語言

設定中可選擇跟隨系統、簡體中文、繁體中文或 English；偏好會儲存，已開啟的主視窗、獨立工具和支援語言事件的外掛同步更新，不清空輸入。不支援的系統語言回退 English。搜尋保留中文、英文與拼音別名。便箋、字數統計、翻譯支援三語；Ctool 複用上游中英文，繁體回退簡體。這裡描述當前開發原始碼，尚不代表正式安裝包已釋出。維護規則見 [i18n 說明](docs/i18n.zh-Hant.md)。

### 應用更新

已釋出的 `v0.2.11` 支援在設定頁手動「檢查更新」。下述自動檢查與首頁提醒對應當前開發版，尚未包含在該發行版中。

預設開啟自動檢查更新：啟動 30 秒後檢查 GitHub 上已公開的正式 Release，此後每 6 小時檢查一次。發現新版本後，首頁顯示「有新版本」，點選進入設定檢視說明並選擇下載；已有待處理更新時保留該版本，不重複檢查。網路失敗不會彈窗打斷使用，下個週期自動重試。可在設定中關閉「自動檢查更新」，關閉後仍可手動「檢查更新」。

下載和重啟安裝由使用者選擇；不會自動下載、降級或安裝預釋出版本。Mac 和 Windows 安裝版支援直接更新，Windows 便攜版提供新版 EXE 下載入口，下載後手動替換。Linux AppImage 支援應用內更新；`.deb` 提供相同架構的新包下載入口，由使用者手動安裝。首次使用需手動安裝帶此功能的版本。

安裝前會等待所有稿紙視窗儲存，儲存失敗時中止安裝。已儲存的剪貼簿、稿紙、設定和外掛資料會保留；JSON 等臨時輸入請在重啟前複製保留。開發模式不檢查更新。

### 檔案搜尋

Windows 版隨包提供官方穩定版 Everything 便攜引擎。開啟「檔案搜尋」時，Nexlet 開始準備自己的後臺例項與索引，預設以普通許可權索引本地固定磁碟中可訪問的檔案。索引就緒後即可輸入搜尋詞；準備期間顯示索引狀態並自動重試，空輸入不列出檔案。可在設定中新增目錄，將索引範圍縮小到工作資料夾。

首次掃描可能需要幾分鐘或更久，介面會顯示建立索引狀態。這種無需安裝服務的資料夾索引，比 Everything 原生 NTFS 索引的首次掃描慢。Nexlet 不安裝 Windows 服務、不新增系統啟動項，也不控制使用者另外安裝的 Everything。退出 Nexlet 時一併關閉自己的索引程序。

macOS 版使用系統 Spotlight 索引，支援中文檔名、多關鍵詞（同時匹配）、雙引號短語、`*.pdf` 萬用字元和 `ext:pdf` 副檔名篩選，最多展示 200 條結果。在設定中可新增檔案搜尋目錄；這些目錄只限制查詢，不會改變系統索引。未索引、尚未更新或被 Spotlight 排除的檔案可能無法找到。macOS 不支援完整 Everything 語法和全文檢索。兩端均支援開啟檔案、定位所在資料夾和複製路徑。雙擊資料夾可在 Nexlet 內瀏覽，支援麵包屑導航、返回上一級和按名稱篩選；選中條目後，右側展示完整路徑、型別、大小及建立和修改時間。

Linux 使用指定目錄內的即時檔名搜尋，支援多關鍵詞、雙引號短語、`*.pdf` 和 `ext:pdf`，最多返回 200 條。先在設定中新增目錄；不掃描全盤，跳過隱藏項和符號連結。修改查詢或關閉視窗會取消舊搜尋，達到時間或遍歷上限時會提示縮小範圍。

### 幾個實用快捷操作

- 搜尋結果右鍵固定到首頁；拖入檔案或貼上圖片可以收進剪貼簿。
- 計算草稿中 `Enter` 將結果帶入下一行，`Ctrl/Cmd+B` 新增備註，`Ctrl/Cmd+N` 新建稿紙。
- 剪貼簿支援 `Ctrl/Cmd` 或 `Shift` 多選、文字合併複製、檔案路徑去重與懸浮中轉。
- 自動回貼需要先在目標應用中按快速鍵開啟 Nexlet；macOS 缺少輔助功能許可權時會請求系統授權引導，請在“系統設定 → 隱私與安全性 → 輔助功能”中允許 Nexlet 後重新回貼。未授權或目標視窗不可用時仍可手動貼上。
- JSON 支援 50 萬字元以內的內容，保留大整數原文；忽略物件鍵順序可選，陣列順序始終參與比較。

### 內容啟動與工具分離

啟動器支援文字、圖片和檔案輸入，並推薦能處理當前內容的工具與外掛。貼上或拖放檔案、圖片後保留輸入卡片，可繼續輸入關鍵詞篩選；取消不會寫入剪貼簿。

點選標題欄的「分離為獨立視窗」可保留當前工作內容。外部外掛保留原頁面狀態；內建工具保留 JSON 輸入、剪貼簿篩選與選擇、稿紙活動頁和編輯位置，以及檔案搜尋查詢與瀏覽位置。稿紙儲存或視窗恢復失敗時保留原工具。JSON 撤銷歷史不遷移，檔案搜尋會在新視窗重新查詢。

## 外掛市場與開發

公開市場由 [Nexlet-plugins](https://github.com/Cansiny0320/Nexlet-plugins) 託管，目錄來自版本化 JSON，安裝包來自 GitHub Releases。可用外掛包括便箋、字數統計和翻譯，具體版本以市場列表為準。點選安裝後直接安裝，不再彈出許可權確認。市場安裝的外掛重新開啟時自動檢查並安裝相容新版；檢查最多 2 秒，下載最多 10 秒，失敗繼續使用舊版，保留獨立資料和本次輸入。正在執行的外掛不重啟，關閉後下次開啟再更新；本地匯入和開發目錄不自動覆蓋。市場頁面仍支援手動重新整理和更新。

外部外掛使用 Nexlet 自有 API，由 HTML、CSS、JavaScript 和 `plugin.json` 組成。支援開發目錄與 `.zip` / `.nexlet` 包匯入。外掛在獨立沙箱中執行，預設內嵌主視窗，也可分離為獨立視窗；沒有 Node.js、任意宿主 IPC 或直接 `fetch` 能力。需要聯網的外掛必須宣告 `network.request` 並透過宿主 API 請求；已安裝外掛按宣告使用該能力，不再逐地址彈窗確認。

從 [`examples/hello-nexlet`](examples/hello-nexlet) 開始，在「外掛管理 → 已安裝 → 載入開發目錄」中選擇它。完整 API、許可權、圖示和打包規則見 [外掛 SDK](docs/plugin-sdk.zh-Hant.md)。Nexlet 不相容 uTools `.upx` 外掛包或 `window.utools` API。

## 資料屬於本機

剪貼簿、稿紙、設定和外掛資料儲存在本機，Nexlet 本身沒有賬號、雲同步或遙測。應用更新和外掛市場會訪問 GitHub；JSON 工具與本機檔案搜尋不上傳輸入內容。翻譯等聯網外掛會將請求內容傳送給其使用的服務，LLM 翻譯使用使用者配置的服務地址。

| 平臺 | 預設資料目錄 |
| --- | --- |
| Windows | `%APPDATA%/Nexlet` |
| macOS | `~/Library/Application Support/Nexlet` |
| Linux | `${XDG_CONFIG_HOME:-~/.config}/Nexlet` |

設定中的「開啟資料目錄」可直接定位。備份前退出 Nexlet，再複製整個目錄。普通剪貼簿、稿紙和外掛儲存沒有額外加密。外掛透過 `secrets` API 儲存的金鑰使用系統 `safeStorage` 加密；系統加密不可用時僅在當前外掛會話中保留。剪貼簿預設保留 500 條非收藏記錄、30 天，收藏不會自動清理。檔案歷史只儲存路徑，不復制原檔案。

## 本地開發

需要 Node.js 24+ 和 npm，CI 使用 [.node-version](.node-version)。Electron 44 使用非同步剪貼簿 API。

```sh
npm ci
npm start
```

```sh
npm run typecheck       # 类型检查
npm test                # 逻辑、数据和边界测试
npm run test:e2e         # Windows 桌面集成测试，会构建应用
npm run package:linux   # Linux x64 + arm64 AppImage / deb（在 Linux 上运行）
npm run package:win     # Windows x64 安装包和便携包
npm run package:mac     # 固定签名的通用 DMG + 更新 ZIP
npm run package:mac:local # 固定签名的本机架构 DMG + 更新 ZIP
```

### 本機固定簽名

個人開發機可用長期保留的自簽名程式碼證書構建，避免每次使用新的 ad-hoc 程式碼身份。首次切換身份仍需重新授權；是否保留輔助功能許可權以實際跨版本升級驗證為準。

2026-10-12 已在 macOS 26.5.2 arm64 上驗證：同一證書從 `0.2.2-local.1` 覆蓋升級到 `0.2.2-local.2` 後，使用者確認無需重新授權即可自動回貼。驗證範圍與焦點干擾說明見 [驗證記錄](docs/validation.md#macos-本机固定签名验证2026-10-12)。

`package:mac:local` 讀取倉庫外的 `~/Library/Application Support/Nexlet Signing/`（可透過 `NEXLET_SIGNING_DIR` 指定其他目錄）：`identity.json` 儲存證書名稱、SHA-1 指紋和專用鑰匙串路徑，`certificate.cer` 為公開證書，`keychain-password` 用於解鎖該鑰匙串。簽名身份應提前配置並僅按需要授予當前使用者的程式碼簽名信任，指令碼不會建立證書或調整信任設定。

```sh
npm run package:mac:local
npm run package:mac:local -- --version 0.2.2-local.1 --arch arm64
```

預設使用 `package.json` 版本和本機架構；`--version` 只覆蓋產物版本，不修改原始碼版本。輸出位於 `release/local-signed-<版本>-<架构>/`，包含 DMG、更新 ZIP、blockmap、更新清單與 `local-signing.json`（證書指紋、簽名條件、安裝包 SHA-256）。缺少證書或簽名校驗失敗會直接報錯，不退回 ad-hoc。構建期間臨時加入專用鑰匙串搜尋路徑，結束後移除並鎖定鑰匙串。

簽名目錄應僅當前使用者可讀，證書與加密私鑰、恢復所需密碼須一起妥善備份；不要提交或公開上傳。更換證書會改變應用身份。自簽名產物未經過 Apple 公證，不提供 Developer ID 的公開分發信任；本地打包不會發布任何附件。

`test:e2e` 使用 `.tmp` 中的隔離資料和資料夾索引，不掃描使用者磁碟；會暫時使用剪貼簿並恢復可讀取的原內容。實時 GitHub 市場驗收可在構建後執行 `node scripts/smoke-marketplace.mjs`。原生回貼專項與平臺限制見 [驗證記錄](docs/validation.md)。

倉庫結構：`src/main` 為桌面宿主，`src/renderer` 為介面，`src/preload` 為受限橋接，`src/shared` 為共享型別與邏輯，`website` 為官網，`tests` 為迴歸測試。

## CI 與發版

[Build and Release](.github/workflows/release.yml) 配置覆蓋 Windows x64、macOS Intel / Apple Silicon、Linux x64 / arm64：型別檢查、單元測試、原生打包、實際啟動；Windows 額外執行桌面整合與便攜 EXE 驗證；Linux 使用 Xvfb/Openbox 驗證打包啟動、XDG 應用啟動、檔案剪貼簿、自啟動和跨程序回貼。新增 Linux 任務的遠端執行狀態需在推送後確認。普通提交和手動執行上傳保留 14 天的 artifacts。

發版時更新 `package.json` 和 `package-lock.json` 的版本，提交後推送匹配的 `v*` 標籤。CI 驗證標籤一致性，生成 Windows 安裝版和便攜版、兩種 Mac 架構的 DMG/ZIP、blockmap、兩種 Linux 架構的 AppImage/deb、更新清單、示例外掛與 `SHA256SUMS.txt`，建立 **Release 草稿**，稽核後手動公開發布。重跑可更新草稿，不覆蓋已釋出版本。雙架構 Mac 清單會合並，並校驗版本、檔案大小和 SHA-512。

Mac 的 main / 版本標籤構建使用 `NEXLET_MAC_CERTIFICATE_P12`（加密 P12 的 Base64）和 `NEXLET_MAC_CERTIFICATE_PASSWORD` 兩項 Actions Secrets，證書指紋固定為 `69397314808BC8B95C8B4AF0FBDFA53C0184FC2C`。指令碼僅允許在一次性 GitHub 託管 runner 中執行：匯入臨時鑰匙串、校驗固定指紋，並用管理員 Code Signing 策略信任該證書，避免使用者級信任彈窗阻塞；結束時移除信任和鑰匙串。憑據缺失即失敗。PR 構建僅使用 ad-hoc 簽名，不接觸憑據。簽名仍未經過 Apple 公證。

貢獻方式見 [CONTRIBUTING.md](CONTRIBUTING.zh-Hant.md)。問題與建議可提交到 [Issues](https://github.com/Cansiny0320/Nexlet/issues)。

## 許可證

Nexlet 使用 [MIT License](LICENSE)，允許使用、修改和分發。Everything、ES 與其他第三方元件保留各自許可證，見 [第三方元件說明](assets/vendor/everything/README.md)。
