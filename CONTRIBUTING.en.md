[简体中文](CONTRIBUTING.md) · [繁體中文](CONTRIBUTING.zh-Hant.md) · [English](CONTRIBUTING.en.md)

# Contributing to Nexlet

Issues, fixes, and plugins are welcome. For new features or data changes, explain the use case, expected behavior, and compatibility before starting broad implementation.

## Development checks

Use Node.js 24+, run `npm ci`, and start with `npm start`. Before submitting, run `npm run typecheck` and `npm test`; desktop behavior changes also require `npm run test:e2e` on Windows. Passing tests does not prove every platform's permission flows. State the actual platform and scope in your PR.

Do not commit dependencies, user databases, clipboard contents, temporary test directories, or private files. The website manages its output under `website/`. Never use real personal data in fixtures or screenshots.

## Implementation conventions

- Keep host system capabilities in `src/main`; UI calls only through restricted preload bridges.
- Validate plugin manifests, permissions, origins, and path boundaries in the host.
- Establish the root cause first and prefer regression tests that demonstrate user behavior.
- Reuse existing types/helpers and avoid unrelated refactoring.
- Keep data changes backward compatible; describe migration and rollback.
- Maintain all three languages, preserve user content and identifiers, and follow the [i18n guide](docs/i18n.en.md).

Submit plugins to [Nexlet-plugins](https://github.com/Cansiny0320/Nexlet-plugins); see [Plugin API v1](docs/plugin-sdk.en.md). Contributions use this project's MIT license. Preserve original licenses for third-party components.
