# AGENTS.md

Playlist ("歌单") layout generator — a static web app. **Greenfield**: the repo currently holds only the spec, `歌单生成器需求.md`, which is the single source of truth for behavior. Read it before implementing anything.

## Hard constraints

- Plain `html + js`, runnable by opening the HTML file locally (`file://`). No build step, bundler, package manager, or server may be introduced unless the user asks.
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
- Background sizing is one of 原大小 / 横向占满 / 竖向占满 / 最适合 (cover, centered), plus opacity and blur.
- Page settings: multi-page with tab add/remove/switch; default portrait orientation; page size and top/right/bottom/left margins editable both numerically and by dragging on the canvas.

## Working notes

- Prefer splitting into a few plain files (e.g. `index.html`, `app.js`, `style.css`) over one giant inline script as the app grows, but keep zero-build semantics. Use classic `<script>`/`<link>` tags: `type="module"` imports are blocked by CORS on `file://`.
- File imports must go through user-gesture `<input type="file">` / drag-drop; there is no backend and no filesystem access beyond what the browser grants.
- If the spec is ambiguous (units, DPI, print output, save/export format), ask rather than inventing a convention — none of these are decided yet.
