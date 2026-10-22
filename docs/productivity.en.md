[简体中文](productivity.md) · [繁體中文](productivity.zh-Hant.md) · [English](productivity.en.md)

# Productivity features

These features are available in Nexlet v0.2.42. Update the app, then update the companion plugins in the marketplace.

1. **Snippets**: create named, grouped text snippets with `{{date}}`, `{{date:YYYY-MM-DD HH:mm:ss}}`, `{{clipboard}}`, and `{{input:Name}}`. Escape a literal opening brace pair with `\{{`. Fill in values and preview before copying, pasting back, or continuing. Saved snippets are commands that support pins, aliases, and shortcuts.
2. **Continue processing**: send results from built-in tools and supported plugins back to the launcher, then choose the next tool. Text, HTML, images, and files transfer directly. Reopen the source tool to recover its state.
3. **Configuration files**: export editable `.nexlet.jsonc` files in Settings. Preview changes and select categories before importing; undo the last import when needed. Plugin inventory is informational. API keys, clipboard content, images, drafts, and private plugin databases are excluded; configuration such as paths and prompts can still contain private information.
4. **Workspaces**: arrange apps, folders, editors, terminals, and websites in order. Programs and arguments are separate fields. Run everything, one item, or failed items only. Cancellation stops remaining launches and does not close apps already opened.
5. **Image text search**: install Offline OCR 1.1.0 or later from the marketplace, then recognize a history image or add a local image. Optionally recognize newly favorited images automatically. Jobs run one at a time and can be cancelled; clearing recognized text keeps the original image.
6. **AI actions**: the companion plugin includes error explanation, writing improvement, task extraction, and commit messages. Configure a model, endpoint, and API key; edit prompts or add actions. Requests start only when you run an action. Streaming, cancellation, copying, paste-back, and continuation are supported. Keys use the host secrets service and are not exported; output is never executed automatically.
7. **Tool state**: switching tools preserves inputs, results, options, and scroll position during the current run. Settings offers optional restart restoration and draft clearing. Detached windows remain isolated; only main-window drafts survive restart. Ordinary drafts are not additionally encrypted.
8. **Rich clipboard history**: retain HTML alongside plain text. Copy or paste with formatting, or choose the plain-text action. Continue a historical table into Text & Table to Image. HTML is not executed by history previews.
9. **Action menu**: press `Cmd/Ctrl+K` or open the context menu in launcher, clipboard, files, and tool results. Navigate with arrow keys, run with `Enter`, and close with `Escape` to restore focus.
10. **Search**: lightweight English typo matching, text/pinyin highlights, and local query preferences. Exact matches keep priority. Only ordinary command-name queries are learned; carried-in content is excluded. Clear learning records in Settings.
11. **Recording controls**: pause for 15 minutes, exclude foreground apps, or preview and clear a time range. Favorites are protected by default. App exclusions cannot be guaranteed where the foreground source is unavailable, including some Wayland environments.
12. **File preview**: select a file and use arrow keys to move between image and UTF-8 text previews. Text reads are capped at 256 KiB; images at 20 MiB and 36 million pixels. Scripts, HTML, and Markdown are not executed.
