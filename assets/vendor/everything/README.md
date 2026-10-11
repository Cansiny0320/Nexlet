# Everything portable engine and ES

Bundled binary: ES 1.1.0.38, Windows x64, unmodified.

- Official download: https://www.voidtools.com/ES-1.1.0.38.x64.zip
- Source: https://github.com/voidtools/ES
- License: MIT, Copyright (c) 2025 voidtools; see `LICENSE`.

Bundled engine: Everything 1.4.1.1032, Windows x64, unmodified. Official download: https://www.voidtools.com/Everything-1.4.1.1032.x64.zip. See `Everything-LICENSE.txt` for the engine and PCRE notices.

Nexlet starts its own named Everything instance on first use. Runtime binary, settings and database are isolated under the Nexlet user data directory. Folder indexing works without administrator rights; no service or startup entry is installed. The engine indexes accessible local fixed drives by default, or only folders configured in Nexlet. The first folder scan can take several minutes. No user file list is sent to a server. Nexlet closes only its own instance on exit.

Arguments use ES `-argv` parsing and `--` before search text. Output is an isolated UTF-8 JSON export in the user's Nexlet cache, removed after each query. Results and timeouts are bounded.
