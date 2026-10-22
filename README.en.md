<p align="center"><img src="assets/icon.png" width="76" alt="Nexlet"></p>
<h1 align="center">Nexlet</h1>
<p align="center">Your everyday tools, one shortcut away.</p>
<p align="center">
  <a href="https://github.com/Cansiny0320/Nexlet/releases/latest"><img src="https://img.shields.io/github/v/release/Cansiny0320/Nexlet" alt="Latest release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-6875e9" alt="Windows, macOS and Linux">
</p>
<p align="center">
  <a href="https://github.com/Cansiny0320/Nexlet/releases/latest">Download</a> ·
  <a href="https://github.com/Cansiny0320/Nexlet-plugins">Plugins</a> ·
  <a href="https://github.com/Cansiny0320/Nexlet/issues">Feedback</a> ·
  <a href="https://nexlet.cansiny0320.chatgpt.site/en/">Website</a>
</p>
<p align="center">
  <a href="README.md">简体中文</a> ·
  <a href="README.zh-Hant.md">繁體中文</a> ·
  <a href="README.en.md">English</a>
</p>

Nexlet is an open-source desktop toolbox. Find apps, revisit clipboard history, run calculations, and work with JSON from one search box. Keep a tool close at hand by moving it into its own window. Available for Windows, macOS, and Linux.

![Nexlet launcher](docs/screenshots/en/launcher.png)

## What can Nexlet help you do?

- **Spend less time finding windows**: use a shortcut to search for apps, files, websites, and plugin commands, with Chinese, English, pinyin, and initials supported.
- **Recover what you just copied**: search text, image, and file history, save favorites, then copy or paste back to the previous app.
- **Calculate and work with text**: type `128*3` to get `384`, use the scratchpad for calculations across multiple lines, or format, inspect, and compare data with the JSON tools.
- **Add the tools you need**: install Notes, Translate, Word count, offline OCR, and more from the plugin marketplace. Pin frequently used tools to the home screen.

## Quick start

**1 · Download and install.** Visit the [latest release](https://github.com/Cansiny0320/Nexlet/releases/latest) and choose a package for your system.

| System              | Download                                 |
| ------------------- | ---------------------------------------- |
| Windows x64         | `Setup.exe` installer or portable `.exe` |
| macOS Apple Silicon | `arm64.dmg`                              |
| macOS Intel         | `x64.dmg`                                |
| Linux x64 / arm64   | AppImage or `.deb`                       |

Windows packages are unsigned, and macOS packages are not yet notarized by Apple. If macOS blocks the first launch, see the [first-launch guide](docs/mac-first-open.md). For Linux installation and desktop limitations, see the [Linux guide](docs/linux.en.md).

**2 · Open with a shortcut.** Press `Alt+Space` on Windows / Linux or `Option+Space` on macOS, then type an app or tool name. You can change the shortcut in Settings.

**3 · Try one everyday task.** Enter a calculation, open Clipboard to recover some text, or drag an image or file into the launcher and choose a tool to handle it. Right-click a search result to pin it to the home screen.

Click the Nexlet icon at the top right of the launcher to open Settings. Choose Simplified Chinese, Traditional Chinese, or English, change your activation shortcut, or enable start at login.

## Everyday tools

### New productivity features (v0.2.42)

The current source adds snippets, workspaces, configuration files, AI actions, image text search, tool state restoration, and improvements to rich clipboard history, actions, search, recording controls, and file previews. See the [productivity guide](docs/productivity.en.md).

### Clipboard and calculation scratchpad

Clipboard keeps text, image, and file history, with search, favorites, multiple selection, and merged copying. The scratchpad supports calculations across multiple lines, chained results, notes, and autosave. Press `Enter` to carry a result into the next line.

<table>
<tr><td width="50%"><img src="docs/screenshots/en/clipboard.png" alt="Clipboard history"></td><td width="50%"><img src="docs/screenshots/en/scratchpad.png" alt="Calculation scratchpad"></td></tr>
<tr><td align="center">Find text, images, and files again</td><td align="center">Keep calculations and notes together</td></tr>
</table>

### JSON and file search

JSON tools offer side-by-side editing, a tree view, and comparisons with red deletions and green additions. You can choose to ignore object key order when comparing.

File search lets you open files, reveal their folders, copy paths, and browse directories. Windows bundles Everything and needs time to build its initial index. macOS uses Spotlight, so results depend on the system index. On Linux, add search directories in Settings first.

![JSON comparison](docs/screenshots/en/json-diff.png)

Timestamp, URL / Base64, UUID, and other everyday tools are included and work offline. Use the detach button in a tool's title bar to move it into a separate window, which you can also keep on top.

### Plugin marketplace

Open Plugins to browse, install, and update tools, or import a local `.zip` / `.nexlet` package. The marketplace includes Notes, Word count, Translate, and offline OCR; check the marketplace for current availability. Offline OCR requires Nexlet 0.2.30 or later.

![Nexlet plugin marketplace with sample listings](docs/screenshots/en/marketplace.png)

Marketplace plugins check for compatible updates when reopened and keep the previous version if an update fails. Nexlet has its own plugin system and does not support uTools `.upx` plugins.

## Usage tips

- **Paste back into an app**: activate Nexlet with the shortcut while in the target app, then select a clipboard item. On macOS, allow Nexlet under System Settings → Privacy & Security → Accessibility. Without permission, you can still copy and paste manually.
- **Application updates**: check manually in Settings or enable automatic checks. You choose when to download and restart to install. Windows portable and Linux `.deb` editions require manual replacement or installation after downloading.
- **Quitting and replacing a portable copy**: closing the main window leaves Nexlet in the tray. Choose Quit Nexlet from the tray before replacing the Windows portable EXE. Save temporary input, such as JSON, before restarting.
- **Linux desktop differences**: global shortcuts and clipboard access on Wayland depend on desktop permissions; use manual paste instead of automatic paste-back. See the [Linux guide](docs/linux.en.md).

## Data and privacy

Clipboard history, scratchpads, settings, and plugin data stay on your machine. Nexlet has no account, cloud sync, or telemetry. JSON tools and local file search do not upload your input. Application updates and the marketplace access GitHub; networked plugins such as Translate send requests to the services they use.

Choose Open data directory in Settings to find your local data. To back it up, quit Nexlet and copy the entire directory. Ordinary clipboard, scratchpad, and plugin data has no additional encryption. File history stores paths rather than copies of the original files.

## Feedback and contributions

Found a bug or have a suggestion? Open an [issue](https://github.com/Cansiny0320/Nexlet/issues) with your operating system, Nexlet version, and steps to reproduce.

To contribute, see the [contribution guide](CONTRIBUTING.en.md). To make a plugin, see the [plugin SDK](docs/plugin-sdk.en.md) and [plugin repository](https://github.com/Cansiny0320/Nexlet-plugins).

## License

Nexlet is [MIT licensed](LICENSE). Everything, ES, and other bundled components retain their own licenses; see [third-party notices](assets/vendor/everything/README.md).
