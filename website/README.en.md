[简体中文](README.md) · [繁體中文](README.zh-Hant.md) · [English](README.en.md)

# Nexlet website

Public site: <https://nexlet.cansiny0320.chatgpt.site>

The website is an independent `website/` project. It migrated locally to React + TanStack Start SSR on 2026-10-14; production behavior depends on the deployed version.

## Stack and commands

- Node.js 24.19.0 (minimum 24.11.0), pnpm 12.11.2, TypeScript 7.0.2.
- React 19.2.6, TanStack Start 1.169.1, TanStack Router 1.170.44.
- Vite+ 1.1.0 (Vite 8.3.3), Sites Vite plugin 0.2.0, Cloudflare Vite plugin 1.37.1.
- Tailwind CSS 4.2.1, shadcn/ui base-nova, Base UI 1.9.0, Lucide React. Existing Nexlet styling is preserved; Tailwind Preflight is disabled.
- Oxlint, Oxfmt, Vitest 5.0.3, Testing Library; Cloudflare Workers and static assets.

From `website/`:

```powershell
pnpm install --frozen-lockfile
pnpm dev
pnpm verify
pnpm format:check
pnpm test:browser
```

Use the `packageManager` version, or `npx --yes pnpm@12.11.2 <command>`. `verify` runs lint, type checks, unit/component tests, and build. The generated route tree is committed and updated by dev/build when routes change.

`build` writes `dist/client`, `dist/server`, and `dist/.openai/hosting.json`; Cloudflare also writes local `.wrangler` state. `test:browser` starts the **built Worker**, runs headless Chrome, and stops it. Results/screenshots go in ignored `.qa/`; run build/verify first. Set `BROWSER_CHANNEL=msedge` for installed Edge, or `SITE_URL` for an existing preview. Tests intercept GitHub Releases and Clipboard API; they do not download installers or modify the system clipboard. `format` modifies files; other checks do not automatically fix source.

## Structure and behavior

- `src/routes/`: home, download, plugin development, localized routes, and root layout; `src/router.tsx` preserves paths and trailing slashes.
- `src/pages/` and `src/components/`: pages, layout, Base UI download menus, copy buttons, release display.
- `site-provider.tsx`: shared download state. SSR and initial hydration use the same fallback; browser mounting detects platform and fetches releases.
- `src/lib/platform.ts`, `releases.ts`: pure platform/release validation and timed requests.
- `seo.ts`, `public/robots.txt`, `public/sitemap.xml`: SEO. `site.json` contains production origin, repository, and fact-check date.
- `src/styles/` and `public/assets/`: styles/tokens, images, fonts, icons, and licenses.
- `src/server.ts`: TanStack Start Worker entry. No login, database, finance dependency, or oRPC.

`downloads.json` holds a verified complete fallback release and direct links. Home/download fetch official GitHub latest Release once per browser load with a five-second timeout, no auth or automatic retry. Only a stable release with Windows x64 portable EXE, both Mac DMGs, and SHA256SUMS.txt matching one version replaces the whole download set. Failure retains usable fallback links. Client navigation preserves the confirmed version; no JavaScript still provides static links.

Unknown platforms/architectures require manual selection; an Intel Mac UA does not prove Intel hardware. Manual choice wins over late architecture detection; both homepage controls share it. Selecting does not download. React handles navigation, menus, and copy feedback; Base UI manages focus, arrows, Escape, and outside clicks.

## Languages

Simplified Chinese keeps `/`, `/download/`, `/plugins/`. English adds `/en/`; Traditional Chinese adds `/zh-Hant/`. URL determines SSR and hydration language. Translation instances are isolated, and the header preserves the current page when switching. All nine routes provide translated title/description, canonical, OG, JSON-LD, hreflang and sitemap entries. Unknown routes return HTTP 404 and noindex. Do not invent ratings, download counts, or released capabilities.

Resources live in `src/lib/locales/`; Chinese source keys are the fallback. `site-language.tsx` owns request/page language. Public document links select the matching language. See the root [i18n guide](../docs/i18n.en.md).

## Assets and visual design

`designs/2026-10-12-ui-v2/` remains the visual baseline. The product collage is an illustrative UI; existing screenshots retain their original identity. Lucide supplies common icons. Brand paths from Simple Icons 11.0.0 retain viewBox and CC0 licensing in `icon.tsx`.

Local Noto Sans SC and decorative LXGW WenKai subsets retain bundled licenses. `scripts/build-font.py`, `scripts/build-note-font.py`, and `fonttools[woff]` rebuild them; ordinary builds need no Python. English and Traditional Chinese social images and product screenshots accompany the localized pages.

## Sites publication boundary

Keep existing project ID `appgprj_6acbbb32d78881919f324dcdf9ee6640`. Hosting configuration now describes a Worker, not static-only output. Do not register a replacement Site. Local implementation and verification do not mean production publication.

Publication requires separate authorization. Then use official `site-workflow.mjs` source sync/packaging, build through `build-site.mjs`, record the exact commit/archive, preserve public audience, and verify deployment succeeded. Root Git commit and Sites source SHA need not match, but website source must. Do not upload the root repository, desktop app, `.qa/`, `node_modules/`, or `.wrangler/`.

The old static implementation is recoverable from Git; production rollback can use the prior Sites version after deployment. This work does not commit, push, or deploy. Migration documents: `docs/specs/2026-10-14-tanstack-migration.md`, `docs/plans/2026-10-14-tanstack-migration.md`, `docs/validation-2026-10-14.md`. Older documents describe historical static-site behavior.

Traditional Chinese also bundles a Noto Sans TC subset from Google Fonts `ofl/notosanstc`, licensed in `public/assets/OFL-NotoSansTC.txt`. Rebuild with `python scripts/build-font.py <NotoSansTC.ttf> zh-Hant`; both font scripts include translation JSON characters.
