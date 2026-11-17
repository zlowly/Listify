# AGENTS.md

Playlist ("歌单") layout generator — a static web app. **Greenfield**: the repo currently holds only the spec, `歌单生成器需求.md`, which is the single source of truth for behavior. Read it before implementing anything.

## Hard constraints

- Plain `html + js`, runnable by opening the HTML file locally (`file://`). Runtime stays zero-build: no bundler, package manager, or transpile step may be introduced. The only exception is the release packaging script `build.sh` (pure copy + version injection + optional zip/Pages), which must not change runtime semantics.
- **Zero build + vendored LeaferJS UMD**: the only runtime dependency is the pinned `vendor/leafer-editor.min.js` (plus the small filter registration plugin), loaded with classic `<script>` tags. No CDN, package manager, `package.json`, or network access is required at runtime. Don't add frameworks or build tooling reflexively.
- UI text and code comments should match the spec's language (Chinese) for user-facing copy; keep identifiers in English.
- A zero-dependency Node regression suite covers pure logic: `node --test scripts/checks/*.test.js` (loader + model/layout/io/zip; no canvas drawing, interaction, or IndexedDB). There is no lint or CI. Also verify by opening the page in a browser and exercising the flow manually (file import, add/remove pages, drag a category into the page, edit properties); `agent-browser` is available for automated checks.

## Domain rules that are easy to get wrong

- Playlist text format: `#分类名` lines start a category; subsequent non-empty lines are song names. Blank lines and stray whitespace/trailing spaces are not meaningful.
- Song "width" for layout ordering counts a CJK/full-width char as 2 and a Latin char as 1 (mixed zh/en names). This drives the fill order and is not the same as `String.length`.
- Two layers only: playlist layer above background layer.
- Table `行数` of `0` means dynamic rows: rows = ceil(songCount / columns).
- Fill orders: column-major by width ("从左往右逐列铺") vs row-major by width ("从上往下逐行铺").
- A page holds optionally many category blocks; each block has two sub-regions (category name, songs) with independent font/size. The songs sub-region may be subdivided into a grid with its own column/row settings.
- Background is a project-level library (`project.backgrounds[]`), not per-page data: each set has a fill color and an ordered image list; pages only store `backgroundId`. Any page can reference any set; deleting a page never copies or dissolves a background.
- Each background image positions independently with `original | fill-width | fill-height | cover | none`. The first four are page-relative and reflow on page resize; `none` uses a fixed page-coordinate rect plus rotation/keepRatio. Direct canvas manipulation of a fit image auto-converts it to `none`.
- `project.unifiedBackground` + `unifiedBackgroundId` are a non-destructive render override: while on, every page renders the global set but each page keeps its own `backgroundId`. Do not implement it by bulk-assigning page IDs. "固化到所有页" and "本页独立副本" are explicit actions that do change IDs.
- Backgrounds stay out of `page.elements`: content always renders above, normal hit-testing never selects a background, background images are drawn clipped to the page (not per image), and playlist-only export skips the whole layer. Background editing is enabled only after selecting a set/image in the layer panel.
- New pages inherit the current effective background; there is no blank/reference dialog.
- Page settings: multi-page with tab add/remove/switch; default portrait orientation; page size and top/right/bottom/left margins editable both numerically and by dragging on the canvas.

## Working notes

- Release build: `./build.sh` rebuilds `dist/` from the single version source `VERSION` and injects `?v=<version>` into every local asset reference in the `dist/index.html` copy. Add `--zip` for `dist/listify-<version>.zip`, and `--pages [--dry-run]` to publish `dist/` (minus the zip) to `origin/gh-pages` after a TTY confirmation. `dist/` is git-ignored and the build never modifies source files.
- Dev-only files never ship: `js/dev-checks.js` (browser-console self checks, `L.devChecks`) is excluded during copy and asserted absent from `dist/`; `index.html` must not load it.
- Utility functions have exactly one implementation: use `model.clamp` / `model.clone` / `model.downloadBlob` and `ui.esc` instead of local copies.
- The build identifier is injected, not hand-edited: `js/app.js` keeps `const BUILD = '…'` as a placeholder and `./build.sh` rewrites it in `dist/js/app.js` to `VERSION`, so it always matches `?v=`.
- Prefer splitting into a few plain files (e.g. `index.html`, `app.js`, `style.css`) over one giant inline script as the app grows, but keep zero-build semantics. Use classic `<script>`/`<link>` tags: `type="module"` imports are blocked by CORS on `file://`.
- Module layout and dependency direction are one-way: `assets`/`model`/`layout`/`render` → `project-schema`/`project-io`/`draft-store` → `ui-fields`/`ui-modal`/`ui-pickers`/`ui-playlist-editor`/`ui-property-panel`/`ui` → `app-chrome`/`app-viewport`/`app-interactions`/`app-presets`/`app-backgrounds`/`app-draft`/`app-import-export` → `app.js`. `index.html` order is the dependency declaration; keep it in sync when adding files.
- UI must not mutate model objects directly: property fields call `L.app.setElementField` / `setElementStyleField` / `setBackgroundColor` / `setBackgroundImageField` (or existing intent methods such as `setPageSize`, `setMargins`, `resizeElementWidth`, `setImageKeepRatio`, `setBackgroundImageValue`) and let the action schedule redraw.
- File imports must go through user-gesture `<input type="file">` / drag-drop; there is no backend and no filesystem access beyond what the browser grants.
- Platform semantics over hand-rolled UI: modals are native `<dialog>` opened through `ui.modal.open/alert/confirm` (do not reintroduce a custom focus trap or scrim), property groups are `<details>/<summary>`, and the sidebar view switch is plain buttons with `aria-pressed`. Newer-than-Baseline APIs (e.g. `popover`, CSS anchor positioning, `closedby`, `scrollbar-gutter`, `requestIdleCallback`) are deliberately avoided because they are not Baseline widely available; keep visual output unchanged when swapping implementations.
- Scripts are classic `<script defer>` tags listed in dependency order in `index.html`; nothing is parser-blocking and `js/app.js` boots on `DOMContentLoaded` (or immediately when already loaded). Do not add `type="module"`, bundle steps, or `async` (order matters).
- Persistence: IndexedDB `listify-draft` v3 holds `draftMeta` (structured project envelope, written async — no `JSON.stringify`), `assetBlobs` (binary `Blob`s), and `assets` (legacy base64 records, read-only compat). Asset reads hand off **pure base64** with any `data:` prefix stripped — `project-io.buildProject` calls `atob` directly, so a data URL there makes a healthy draft look corrupt. `localStorage` (`listify.draft.v1`) is only written as a one-shot fallback on `pagehide`/`visibilitychange`; normal editing must not touch it.
- Preset library is generated, not hand-edited: categories/names/display names live in `presets/manifest.json`, images in `presets/<category>/`; run `./scripts/build-presets.sh` to regenerate `js/presets-data/` (index + category chunks, split into `<category>-N.js` at a 700KB budget; `index.js` carries `chunkMap`/`chunks`). Generated media is AVIF q58 at long edge 1400 (`data:image/avif`), except the `solid` category which stays WebP q78 (`data:image/webp`) to avoid gradient banding; thumbnails are 128px WebP q60. `presets/` keeps the WebP q78 sources as the only encoding source — never write AVIF (or any re-encoded file) back into `presets/`; the AVIF transcode goes to a temp dir so repeat builds don't accumulate generational loss and `--format webp --quality 78` can restore the old output. The default AVIF build enforces size/PSNR gates (total base64 ≤ 5.0MB, entry/chunk ≤ 700KB, sampled PSNR mean ≥ 40 dB) and fails without writing; an explicit `--format webp` is the documented emergency fallback, so its oversize output only warns (same rule in `build.sh`). The runtime never reads the config (`file://` forbids it), so a config change without a rebuild never reaches the UI. Category chunks are prefetched on ~300ms hover dwell or pointer-down, and script injection is deferred to a separate async task. Script roles are documented in `scripts/README.md`.
- If the spec is ambiguous (units, DPI, print output, save/export format), ask rather than inventing a convention — none of these are decided yet.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
