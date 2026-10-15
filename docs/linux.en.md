[简体中文](linux.md) · [繁體中文](linux.zh-Hant.md) · [English](linux.en.md)

# Linux guide

The development version adds Linux x64 and arm64 support; release assets require publication of the corresponding version. Use deb on Debian/Ubuntu and preferably AppImage on other desktop distributions. Validation scope appears below. x64 AppImage filenames use `x86_64`, deb uses `amd64`; both ARM packages use `arm64`.

## Installation and dependencies

- deb: `sudo apt install ./Nexlet-<version>-Linux-<arch>.deb` installs GTK, NSS, GIO, and other dependencies and recommends `xdotool` and `fonts-noto-cjk`.
- AppImage: place it in a permanent directory, run `chmod +x Nexlet-<version>-Linux-<arch>.AppImage`, then launch it. A graphical desktop, GTK 3, NSS, and GIO (`libglib2.0-bin` on Debian/Ubuntu) are required. Paste-back additionally requires `xdotool`. Install CJK fonts such as `fonts-noto-cjk` to avoid missing Chinese glyphs. Without FUSE 2, use `APPIMAGE_EXTRACT_AND_RUN=1 ./Nexlet-<version>-Linux-<arch>.AppImage`.
- Run as an ordinary user with Chromium sandbox enabled. Automated smoke uses Playwright test arguments and does not replace distribution-specific sandbox validation.

## X11 and Wayland

| Capability | X11 | Wayland |
| --- | --- | --- |
| App search, tools, directory file search | Supported | Supported; real desktop validation pending |
| Copy text, images, files | Supported | Subject to desktop clipboard permissions |
| Background clipboard history | Supported | Continuous global reading depends on compositor permissions |
| Global shortcuts | Supported; change to Ctrl+Alt+Space on conflict | Requires GlobalShortcuts portal and desktop authorization |
| Paste-back | Requires xdotool; target window/process verified first | Initial version uses copy then manual paste |
| Tray | Requires desktop tray support | Same; GNOME may need an extension |

Linux desktop identity is `app.nexlet.desktop.desktop`, matching the packaged entry. Wayland portal must resolve this desktop file; AppImages not integrated into the desktop menu may fail shortcut registration. Try deb first. Nexlet cannot force a Wayland desktop to foreground a window or move it to the pointer's screen.

## Application and file search

Apps come from XDG user/system applications directories, including common Flatpak exports. Add more directories in Settings. User entries override system entries; hidden entries or entries for other desktops are excluded. `gio launch` handles desktop Exec fields; Nexlet does not execute shell strings itself.

File search traverses only configured directories and matches filenames: multiple terms, quoted phrases, wildcards, and extension filters. It skips hidden entries and symlinks, returns at most 200 results, and limits traversal to five seconds, 100,000 entries, and 64 levels. A single slow filesystem I/O can extend elapsed time. Unreadable directories are skipped with a warning; partial results are not labeled complete. Open, reveal, copy path, and folder browsing remain available.

File clipboard writes both `text/uri-list` and `x-special/gnome-copied-files`. History replay always copies rather than repeating a cut. Only local file URLs are accepted.

## Startup and updates

Enabling Start at login writes Nexlet's own desktop file under `$XDG_CONFIG_HOME/autostart` (default `~/.config/autostart`); disabling removes only that file. Status is reread from disk. AppImage uses its original `APPIMAGE` path; reenable startup after moving it.

AppImage uses electron-updater for matching-architecture downloads; download/restart are user choices and the path must be writable. deb checks stable releases and offers a matching package for manual package-manager upgrade. x64 uses `latest-linux.yml`; arm64 uses `latest-linux-arm64.yml`. Publishing validates version, file size, and SHA-512 separately.

## Build

On Linux, `npm ci && npm run package:linux` builds both architectures. For one, use `npm run package:linux -- --arch arm64` or `x64`. Packaging checks and installs matching koffi native dependencies from the lockfile, then verifies ELF architecture. deb requires `fpm`; native ARM can install Ruby, run `gem install fpm`, and set `USE_SYSTEM_FPM=true`.

## Languages and validation

Settings supports system language, Simplified Chinese, Traditional Chinese, and English; see [i18n](i18n.en.md). Language resources are bundled for offline use. Native dialogs may still follow the desktop's language.

CI configuration includes native Ubuntu 24.04 x64/arm64 builds and packaged smoke under Xvfb + Openbox. Real GNOME/KDE Wayland and AppImage upgrade installation still need validation. Local build/test does not mean remote CI passed or a release was published. See the [2026-10-13 record](validation/linux-support-2026-10-13.md) for existing builds, hashes, and limits.
