# AGENTS.md

Playlist ("歌单") layout generator — a static web app. **Greenfield**: the repo currently holds only the spec, `歌单生成器需求.md`, which is the single source of truth for behavior. Read it before implementing anything.

## Hard constraints

- Plain `html + js`, runnable by opening the HTML file locally (`file://`). Runtime stays zero-build: no bundler, package manager, or transpile step may be introduced. The only exception is the release packaging script `build.sh` (pure copy + version injection + optional zip/Pages), which must not change runtime semantics.
- **Zero build + vendored LeaferJS UMD**: the only runtime dependency is the pinned `vendor/leafer-editor.min.js` (plus the small filter registration plugin), loaded with classic `<script>` tags. No CDN, package manager, `package.json`, or network access is required at runtime. Don't add frameworks or build tooling reflexively.
- UI text and code comments should match the spec's language (Chinese) for user-facing copy; keep identifiers in English.
- There is no test suite, lint, or CI. Verify by opening the page in a browser and exercising the flow manually (file import, add/remove pages, drag a category into the page, edit properties). `agent-browser` is available for automated checks.

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
- Prefer splitting into a few plain files (e.g. `index.html`, `app.js`, `style.css`) over one giant inline script as the app grows, but keep zero-build semantics. Use classic `<script>`/`<link>` tags: `type="module"` imports are blocked by CORS on `file://`.
- File imports must go through user-gesture `<input type="file">` / drag-drop; there is no backend and no filesystem access beyond what the browser grants.
- Preset library is generated, not hand-edited: categories/names/display names live in `presets/manifest.json`, images in `presets/<category>/`; run `./scripts/build-presets.sh` to regenerate `js/presets-data/` (index + one chunk per category). The runtime never reads the config (`file://` forbids it), so a config change without a rebuild never reaches the UI. Script roles are documented in `scripts/README.md`.
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
