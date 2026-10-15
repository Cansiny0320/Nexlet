[简体中文](linux.md) · [繁體中文](linux.zh-Hant.md) · [English](linux.en.md)

# Linux 使用說明

當前開發版新增 Linux x64 和 arm64 支援；發行資產需等對應版本正式釋出。Debian/Ubuntu 可使用 deb，其他桌面發行版優先使用 AppImage。當前驗證環境與未驗證項見本文末尾。

x64 架構的 AppImage 檔名使用 `x86_64`，deb 使用 `amd64`；ARM 兩種包均使用 `arm64`。

## 安裝和依賴

- deb：使用 `sudo apt install ./Nexlet-<版本>-Linux-<架构>.deb`，由包管理器安裝 GTK、NSS、GIO 等依賴，並推薦安裝 `xdotool` 和 `fonts-noto-cjk`。
- AppImage：放在固定目錄，執行 `chmod +x Nexlet-<版本>-Linux-<架构>.AppImage` 後執行。需要圖形桌面、GTK 3、NSS、GIO（Debian/Ubuntu 的 `libglib2.0-bin`）；自動回貼另需 `xdotool`。精簡系統請安裝中文字型，例如 `fonts-noto-cjk`，避免介面文字顯示方框。若系統沒有 FUSE 2，可使用 `APPIMAGE_EXTRACT_AND_RUN=1 ./Nexlet-<版本>-Linux-<架构>.AppImage`。
- 以普通使用者執行 Nexlet，生產執行保留 Chromium sandbox。自動化 smoke 使用 Playwright 的測試啟動引數，不能替代各發行版上的 sandbox 驗收。

## X11 與 Wayland

| 能力 | X11 | Wayland |
| --- | --- | --- |
| 應用搜尋、工具、目錄檔案搜尋 | 支援 | 支援，真實桌面待驗收 |
| 文字、圖片、檔案複製 | 支援 | 受桌面剪貼簿許可權限制 |
| 後臺剪貼簿歷史 | 支援 | 不承諾全域性持續讀取，取決於合成器許可權 |
| 全域性快速鍵 | 支援；衝突時可改 Ctrl+Alt+Space | 依賴 GlobalShortcuts portal 與桌面授權 |
| 自動回貼 | 需要 xdotool；回貼前核對視窗與程序 | 首版使用複製後手動貼上 |
| 托盤 | 依賴桌面托盤支援 | 同左，GNOME 可能需要托盤擴充套件 |

Linux 桌面身份使用 `app.nexlet.desktop.desktop`，與安裝包中的入口檔案一致。Wayland portal 需要系統能夠解析該 desktop 檔案；未整合到桌面選單的 AppImage 不保證快速鍵註冊成功。可先使用 deb 安裝。應用無法強制 Wayland 桌面把視窗置於前臺或移動到游標所在螢幕。

## 應用與檔案搜尋

應用從 XDG 使用者/系統 applications 目錄讀取，包含常見 Flatpak 匯出目錄；額外目錄可在設定中新增。使用者項優先覆蓋系統項，隱藏/不展示/不屬於當前桌面的條目不會出現。啟動交給 `gio launch` 處理 desktop Exec 欄位，Nexlet 不自行執行 shell 字串。

檔案搜尋僅遍歷使用者新增的目錄，按檔名匹配；支援多關鍵詞、雙引號短語、萬用字元、副檔名過濾。跳過隱藏項和符號連結，最多 200 條，設有 5 秒遍歷預算、10 萬項和 64 層深度限制；慢檔案系統的一次系統 I/O 仍可能延長實際耗時。無法讀取的目錄會跳過並提示，不會將部分結果描述為完整掃描。結果支援開啟、定位、複製路徑和已有資料夾瀏覽功能。

檔案剪貼簿同時寫入 `text/uri-list` 與 `x-special/gnome-copied-files`；重放歷史統一採用複製，不重新執行剪下。只接受本地檔案 URL。

## 自啟動與更新

使用者開啟開機自啟動時，在 `$XDG_CONFIG_HOME/autostart`（預設 `~/.config/autostart`）儲存 Nexlet 自己的 desktop 檔案，關閉時僅刪除該檔案。狀態從檔案回讀；AppImage 使用 `APPIMAGE` 提供的原始路徑，移動檔案後重新開啟自啟動。

AppImage 使用 electron-updater 下載同架構更新，下載/重啟由使用者選擇；路徑必須可寫。deb 檢查正式 Release 後提供同架構 deb 下載入口，由使用者使用包管理器升級。x64 使用 `latest-linux.yml`，arm64 使用 `latest-linux-arm64.yml`，釋出流程分別校驗版本、檔案大小和 SHA-512。

## 構建

在 Linux 上執行 `npm ci && npm run package:linux` 可生成兩種架構；單架構使用 `npm run package:linux -- --arch arm64`（或 `x64`）。打包指令碼按 lockfile 校驗並補齊目標架構的 koffi 原生依賴，再檢查 ELF 架構，避免跨架構構建產生無法啟動的包。構建 deb 需要 `fpm`；原生 ARM 環境可安裝 Ruby 後 `gem install fpm` 並設定 `USE_SYSTEM_FPM=true`。

## 驗證

CI 配置包含 Ubuntu 24.04 x64/arm64 原生構建，使用 Xvfb + Openbox 執行打包後 smoke。真實 GNOME/KDE Wayland、跨版本 AppImage 更新安裝仍須另行驗收。僅本地構建與測試不代表遠端 CI 或發行版已釋出。

本次實際構建、校驗值與驗收邊界見 [2026-10-13 驗證記錄](validation/linux-support-2026-10-13.md)。

## 介面語言

設定支援跟隨系統、簡體中文、繁體中文與 English，語言資源隨包離線提供。系統原生對話方塊可能繼續跟隨桌面語言，詳見 [i18n 說明](i18n.zh-Hant.md)。
