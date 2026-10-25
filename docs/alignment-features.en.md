[简体中文](alignment-features.md) · [繁體中文](alignment-features.zh-Hant.md) · [English](alignment-features.en.md)

# Shared capabilities, capture and account sync

These changes target Nexlet 0.2.47. A local build is not a published client release.

## AI and capability providers

Settings manages provider URLs, protocols, model IDs and the default model. Chat Completions, Responses and Anthropic Messages are supported. Keys remain in the main process and use system encryption; when unavailable, keys stay in memory only. Changing the URL or protocol clears the old key. Models can be entered manually. Image and tool capabilities are explicit; tool calls return data and are never executed automatically.

The legacy `nexlet.ai.configure/models/chat/onChunk` contract remains supported. AI Actions and Translate can select shared models. Explicit legacy migration copies model definitions and endpoints, without keys or changes to private configurations.

OCR and translation have independent provider selection. Paddle OCR runs locally; Google and shared AI translation use cloud services. Missing, disabled, updated or failed providers report an error without silently switching between local and cloud processing. Providers with configuration schemas expose an expandable JSON editor.

## Capture and marketplace

Capture editing supports shapes, arrows, pen, text, highlight, mosaic, blur, opaque redaction, selection/movement/deletion and undo/redo. Exported PNGs contain the actual annotated pixels.

Long screenshots use manual scrolling while the overlay hides for 3 seconds. Adjust uncertain overlap or remove segments. Limits are 30 segments, 36 million pixels, 32768 pixels in height and 20 MiB output. Linux currently supports standard capture only. Capture and pinned-image windows can use shared OCR/translation and copy or continue processing results.

The marketplace offers list/cards, categories, name/update sorting and expandable details. Download tasks support cancellation and retries, followed by installation confirmation. Added permissions and providers changing from local to cloud require renewed consent, including background updates.

## Accounts and sync

Sign in with GitHub in the system browser, confirm a device code and receive a Nexlet session through Better Auth Device Authorization. Neither GitHub credentials nor Nexlet sessions reach renderers or plugins. Public accounts have 100 MiB of sync storage.

Nothing uploads automatically on first login. Select settings, commands, pins, web shortcuts/bookmarks, snippets, AI actions/models, notes, scratchpads and plugin manifests. Favorite clipboard text, images and history are separate, off by default. API keys, account credentials and private plugin databases are excluded. File history contains names only, not original files or usable paths.

Remote paths and shortcuts await local confirmation and validation. Plugin manifests offer downloads without automatic installation. Sync bodies are encrypted on the server, not end-to-end encrypted.

Persistent local queues survive restarts and offline periods. Server revisions, idempotent mutation IDs, explicit conflict resolution and tombstones prevent silent overwrites and automatic resurrection. Switching accounts clears the old queue and starts with no categories selected. Users can inspect/revoke sessions, sign out or delete their cloud account. Deletion requires a login within the last 10 minutes, preserves local content and may remain in service backups for up to 7 days.

## Practical plugins and validation

`Nexlet-plugins` provides PDF tools, image batch and batch rename. Each README documents its limits, licenses and cancellation/recovery behavior. Local packages are not automatically published to the marketplace.

Background tests cover AI streams, provider lifecycle, actual capture pixels, installation tasks, sync transactions, PostgreSQL, backup restoration, and PDF/image/rename output. Native permissions, real multi-display capture, manual scrolling and final visual interactions still require desktop verification when window tests are permitted.
