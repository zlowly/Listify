# Design

## Context

Greenfield static app. See `proposal.md` for motivation and `specs/` for behavior contracts. The implementation must run by opening `index.html` from `file://`: no build step, no server, no bundler, no package manager, and only Chrome is targeted. The existing repo contains the requirements document and OpenSpec scaffolding; no application code exists yet.

The canvas editor needs selection, dragging, resizing, z-order, text editing, image fills, custom table drawing, and PNG export. Building all of that from scratch is unnecessary; the design vendors LeaferJS's UMD editor build locally and keeps the domain model independent of it.

## Goals / Non-Goals

**Goals:**

- Keep the domain model as the single source of truth so save/load, re-import, and export do not depend on the canvas library's serialization.
- Keep the page layout deterministic: given the playlist, styles, and table settings, the same layout is produced every render.
- Support the full import → arrange → save → reload → export loop with no backend.
- Make edit-only aids (borders, guides, red warnings) impossible to leak into exported PNGs.
- Stay within `file://` restrictions: classic scripts, vendored UMD, File API, Blob URLs, no module imports.

**Non-Goals:**

- No framework, build, test runner, or package manager in the app.
- No server-side rendering, cloud sync, accounts, or collaboration.
- No undo/redo, draft autosave, multi-select, rotation, image crop, or all-page export in v1.
- No automatic category splitting or cross-page continuation.

## Decisions

### 1. Runtime: vendored LeaferJS UMD, classic scripts

Use `leafer-editor`'s UMD build under `vendor/leafer-editor.min.js`, loaded with a classic `<script>` tag, plus the filter plugin needed for background blur. This provides the editor, viewport, text editing, image fills, custom drawing, and export primitives without a build step.

Alternatives considered:
- Fabric.js / Konva: capable, but the editor interactions (selection, text editing, viewport) need more assembly; Leafer's editor bundle is closer to the target.
- tldraw / Excalidraw: React/build-based, incompatible with `file://` and zero-build.
- Hand-written canvas editor: too much interaction work for the scope.

The exact vendored version is pinned in `vendor/`; no CDN is used at runtime.

### 2. Domain model owns the document; Leafer owns the view

The project JSON is a plain JS object (`Project`) with pages, elements, playlist data, and asset IDs. Leafer nodes are created from that object and updated on changes. We never store Leafer's `toJSON()` as the project format.

Rationale: re-import reconciliation, versioning, asset deduplication, and export clipping are all easier against a small explicit schema. It also avoids leaking editor-only nodes (selection handles, guides) into saved data.

The trade-off is a small render/update layer; it is simpler than trying to make the editor's serialization stable across library versions.

### 3. File layout

Plain files, loaded in order:

```text
index.html
style.css
vendor/leafer-editor.min.js
vendor/leafer-filter.min.js
js/model.js        // defaults, schema validation, state helpers
js/import.js       // decoding, parsing, duplicate validation, reconciliation
js/layout.js       // virtual width, sorting, table assignment, measurement, column widths
js/render.js       // Leafer page/block/grid/text/image views
js/ui.js           // sidebar, tabs, properties, layer panel, modals
js/io.js           // project save/load, asset encoding
js/export.js       // PNG export
js/app.js          // bootstrap, store, selection, actions
```

Each file attaches to a single global namespace (for example `window.Listify`) rather than using ES modules, because `type="module"` is blocked by CORS on `file://`.

### 4. Project schema (v1)

```js
Project = {
  version: 1,
  pageSize: { width: 1080, height: 1920 },
  margins: { top: 60, right: 60, bottom: 60, left: 60 },
  playlist: {
    categories: [
      { name: "未分类", songs: ["歌名", "..."] }
    ]
  },
  assets: [
    { id: "sha256-or-fallback", name: "bg.jpg", mime: "image/jpeg", data: "<base64>" }
  ],
  pages: [
    {
      id: "page-1",
      background: {
        assetId: null,
        fit: "cover",          // original | fill-width | fill-height | cover
        opacity: 1,
        blur: 0,
        color: "#ffffff"
      },
      elements: [
        {
          id: "el-1",
          type: "category",
          category: "流行",
          x: 60, y: 60, width: 960,
          titleStyle: { fontFamily, fontSize, fontWeight, color, lineHeight },
          songStyle:  { fontFamily, fontSize, fontWeight, color, lineHeight },
          tables: [
            {
              columns: 3,
              rows: 0,          // 0 = dynamic; only allowed on the last table
              fill: "column",   // column | row
              align: "left",    // left | center | right | justify
              widthMode: "auto",// auto | manual
              widths: []        // px array when manual
            }
          ]
        },
        {
          id: "el-2",
          type: "text",
          x: 100, y: 100, width: 400,
          text: "主标题",
          style: { fontFamily, fontSize, fontWeight, color, lineHeight, align }
        },
        {
          id: "el-3",
          type: "image",
          x: 100, y: 300, width: 300, height: 300,
          assetId: "sha256-or-fallback",
          fit: "cover",         // cover | contain | stretch
          opacity: 1
        }
      ]
    }
  ]
}
```

Derived, not stored: block height, table row heights, automatic column widths, sorted song order, unplaced categories, and whether a category block exists on some page. A category may have at most one block across the whole project, not one per page.

### 5. Layout engine

The layout engine is pure: it takes the category's song list, block width, styles, and table settings, and returns the table assignments, computed row counts, column widths, cell positions, and whether a new table must be appended.

- **Virtual width**: iterate Unicode code points; CJK/full-width ranges count 2, everything else counts 1. Sorting is ascending and stable: `(width, originalIndex)`. The whole category is sorted first, then sliced by table order.
- **Table assignment**: tables are processed top-to-bottom. A fixed table takes `min(remaining, columns * rows)`. The last dynamic table takes all remaining songs and uses `rows = ceil(count / columns)`. A dynamic table is only legal as the last table; the UI clamps or moves it otherwise.
- **Auto-continuation**: if songs remain after the last fixed table, append a dynamic table that copies the last table's properties (`columns`, `fill`, `align`, `widthMode`, `widths`) and has `rows = 0`. The appended table is persisted in the block so it survives save/load.
- **Column widths**: assign songs to cells first, then measure the longest song in each column with a hidden 2D canvas using the exact font string. Auto mode distributes the table width proportionally to `maxWidth + 2 * cellPaddingX`; empty columns get a small equal share. Manual mode uses stored pixel widths, scaled proportionally when the block width changes. Changing `columns` resets the table to auto.
- **Row height**: `fontSize * lineHeight + 2 * cellPaddingY`. All rows in a table share the same height; song text is single-line and clipped, never wrapped. The category title may wrap; its line breaks and height are measured with the same hidden 2D canvas, so the layout engine stays pure.
- **Block height**: `paddingTop + titleHeight + titleGap + sum(tableHeights)`; when the last table has visible rows its bottom edge coincides with the block bottom, otherwise the block keeps a small bottom padding. Tables span the full block width and stack with no extra gap. The block's height is set after layout and is not user-resizable.
- **Red warning**: a cell is red when the measured song width exceeds the cell's inner width. The red fill is drawn only when `editMode` is true. Text is clipped in both modes.
- **Alignment**: left/center/right position the measured text inside the cell. Justify computes `extra = innerWidth - textWidth` and distributes it as letter spacing across `charCount - 1` gaps; a single character falls back to center.
- **Measurement safety**: add a 2px safety margin to measured widths to absorb small differences between the hidden canvas and Leafer's text rasterization.

### 6. Import and reconciliation

- **Decoding**: inspect BOM first (UTF-8, UTF-16LE/BE); otherwise try `TextDecoder('utf-8', { fatal: true })`; fall back to `TextDecoder('gb18030')`. If both fail, show an encoding dialog and let the user retry with an explicit encoding. Import is atomic: parse and validate the whole file before touching state.
- **Parsing**: normalize CRLF/CR to LF, split, trim each line, skip empty lines. A line starting with `#` starts a category; the name is the trimmed remainder. Lines before the first `#` go to `未分类`. Empty category names are errors. A category with no songs is allowed.
- **Validation**: collect duplicate category names and duplicate song names with line numbers, plus empty category names. If any error exists, reject the whole import and show a modal. Category/song cross-type collisions are allowed.
- **Reconciliation**: after a valid parse, build a map of existing category blocks across all pages. For each new category, keep an existing block if the name matches; otherwise mark it unplaced. Remove blocks whose category no longer exists. A rename therefore removes the old block and leaves the new category unplaced, per the specs. Free text, images, pages, and backgrounds are untouched.
- **Song storage**: store the imported order in `playlist`. The layout sort is computed on render; it never rewrites `playlist`. Re-import replaces the song arrays and the layout recomputes. Manual column widths and table structure are preserved; if the new songs are wider, red warnings may appear until the user restores auto widths.
- **Safety**: before committing a re-import that removes or renames categories, show a confirmation summary listing added/removed categories. This is a UX safeguard, not a change to the merge rule.

### 7. Background and assets

- **Asset store**: each imported image becomes an asset with a content ID. In memory, keep the `Blob` and an object URL for Leafer; base64 is generated only when saving. The same bytes are deduplicated by hash.
- **Hash**: prefer `crypto.subtle.digest('SHA-256', buffer)`. If unavailable on `file://`, fall back to a 64-bit FNV-1a hash over the bytes plus the byte length. IDs are opaque; collisions are practically irrelevant for this use case.
- **Background view**: a page-sized clipped container. A color rect is drawn first; an image rect is drawn above it. Fit modes compute the image rect geometry: original = natural size centered; fill-width = page width with proportional height centered; fill-height = page height with proportional width centered; cover = scale to cover and center. The image rect uses `stretch` fill with the computed geometry, so the layout is explicit.
- **Opacity/blur**: opacity is applied to the image rect, not the color. Blur uses the Leafer filter plugin if available; otherwise the image is pre-blurred into an offscreen canvas with `ctx.filter = 'blur(Npx)'` and used as the image source. The fallback keeps export behavior identical.
- **Page inheritance**: "沿用上页背景" copies the background object and keeps the same `assetId`. Editing opacity/fit/color/blur on either page only changes that page. Replacing the image creates a new asset and a new `assetId`; the old page keeps the old asset.
- **Missing assets**: loading a project with a missing asset ID fails the load instead of rendering a blank image, per the persistence spec.

### 8. Editor interactions

- **Leafer editor configuration**: create the app with `editor: {}`; configure single selection and disable rotation/multi-select where supported. Category blocks use width-only resize; free text uses width-only resize with auto height; free images use width and height. The exact option keys for these restrictions are verified early; if the editor cannot express width-only resize, custom overlay handles take over.
- **Selection**: Leafer's editor owns selection, drag, and resize for page elements. The layer panel selects the same nodes. The background is not selectable by canvas click; selecting it in the layer panel selects a page-level background handle (or shows background properties without a canvas selection).
- **Column dividers**: edit-only divider handles live in an overlay layer above the page, not inside the page container. They are not exported. Dragging a handle updates the table's manual widths and redraws the grid. This avoids fighting the editor's element-drag gesture.
- **Page size/margin handles**: page resize and margin guides also live in the overlay. Dragging a margin guide updates the global margins; dragging the page corner updates the global page size. Both update the HTML property panel.
- **Category drag-in**: the left category list uses pointer/HTML drag events. On drop, convert client coordinates to world coordinates using the viewport transform, clamp the block's x to the page, and create a block with the default content width. If the category already has a block on another page, switch to that page and select it instead of creating a duplicate.
- **Auto-height blocks**: the block container's height is set after layout. The editor must not persist a user-dragged height for category blocks; on resize end, any height change is discarded and the computed height is restored.
- **Text editing**: free text uses Leafer's `editable` text with the text-editor plugin. On edit end, commit the text to the model. Category names and song names are not editable in-canvas; they come from the imported playlist.
- **Overflow warning**: the overlay draws an outline/badge when a block's bounds exceed the page. It is not part of the page container, so it cannot be exported.

### 9. Persistence

- **Save**: serialize only referenced assets (walk pages/elements for `assetId`), convert blobs to base64, and download a JSON file. Add `version: 1`. The playlist is always included, even if every category is unplaced.
- **Load**: parse JSON, validate version and required fields, decode base64 into blobs, rebuild the in-memory asset store, replace state, and rebuild the current page. Any validation or asset error aborts the load and leaves the current project untouched.
- **Round-trip**: page order, global size/margins, element geometry, styles, tables, manual widths, z-order, backgrounds, playlist order, and unplaced categories all survive. Derived values are recomputed, not trusted from the file.
- **Draft autosave**: out of scope for v1. If added later, store blobs in IndexedDB rather than base64 in localStorage.

### 10. Export

- **Target**: export the page container only, not the editor world. The overlay (guides, handles, warnings) and the editor selection are outside it, so they are excluded by construction. The block/grid `editMode` flag is also set to false during export for borders/red cells.
- **Size**: default to the page's pixel size. The dialog offers width/height with an aspect lock. With the lock on, changing one field updates the other. With it off, the output is stretched to the entered size; if Leafer's export only supports uniform scale, export at page size and draw the result into a target-size offscreen canvas.
- **Readiness**: wait for all image assets used on the page to decode, and `await document.fonts.ready` before exporting. On failure, show an error and do not download a partial file.
- **Filename**: `歌单_第N页.png`.
- **Scope**: current page only. All-page export/zip is deferred.

### 11. UI shell

- Top bar: import, add text, add image, save, load, export.
- Page tab strip: page buttons plus add/delete; new page opens a small dialog for blank/inherit background.
- Left sidebar: two tabs, "分类" and "图层"; bottom section is the property panel.
  - Category list: imported categories in order, with a placed/unplaced indicator; drag to canvas, click a placed category to jump to its block.
  - Layer panel: "背景" plus content elements in z-order, with up/down buttons and selection.
- Canvas: Leafer viewport with page centered, zoom/pan, gray surround, page shadow, margin guides.
- Property panel contexts: page/global settings, background, category block (title style, song style, table list), free text, free image. Table editing is nested under the selected category block.
- Dialogs: import errors with line numbers, encoding retry, re-import summary, delete page/block confirmation, export size.

### 12. Verification

No automated test suite exists. Verification is manual in Chrome, optionally driven by `agent-browser`:

1. Import a UTF-8 file with unclassified songs, a GBK file, and a file with duplicate names.
2. Drag categories, overlap blocks, resize widths, drag column dividers, change rows/columns/fill/alignment.
3. Verify 21 songs / 5 columns / rows 0 → 5 rows; verify auto-continuation after a full fixed table.
4. Toggle margins, resize the page, add/remove pages, inherit a background, replace an image.
5. Save, reload, and confirm geometry, styles, manual widths, z-order, and unplaced categories survive.
6. Export with overflow and confirm the PNG is clipped and contains no borders, guides, red cells, or selection handles.

## Risks / Trade-offs

- **Leafer editor constraints (width-only resize, single select)** → verify the API early; fall back to custom overlay handles and disabling built-in resize for category blocks.
- **Text measurement mismatch between hidden canvas and Leafer** → 2px safety margin; red-warning uses the same measurement; manual widths can always be corrected.
- **Blur/export support in Leafer filters** → offscreen `ctx.filter` fallback; export the pre-blurred image.
- **Large base64 images and memory** → object URLs in memory, base64 only on save; warn on very large images; do not autosave drafts.
- **`crypto.subtle` / font APIs on `file://`** → FNV-1a hash fallback; font check is advisory, with a safe fallback stack.
- **No undo/redo** → confirmation dialogs for destructive actions (delete page, delete block, re-import removing categories); undo can be added later as model snapshots.
- **Re-import with renamed categories loses styles** → this is the chosen rule; the re-import summary warns before committing.
- **Manual widths after re-import may trigger red cells** → expected; offer "恢复自动" per table.
- **Overlapping blocks and z-order confusion** → layer panel order plus selection outline; no automatic layout.

## Migration Plan

Greenfield, so no data migration. Implementation order:

1. Vendor Leafer UMD and filter plugin; scaffold `index.html`/`style.css`/namespace.
2. Implement model, defaults, virtual width, sorting, and table layout as pure functions.
3. Implement import/decoding/reconciliation with atomic validation.
4. Implement page/background/category/text/image views and the overlay.
5. Wire the sidebar, tabs, property panel, layer panel, and editor interactions.
6. Implement save/load and PNG export.
7. Update `AGENTS.md` from "zero dependency" to "zero build + vendored Leafer UMD".
8. Run the manual verification checklist in Chrome and `agent-browser`.

Rollback is simply removing the new files; no external services or data stores are involved.

## Open Questions

- Exact Leafer editor option keys for disabling rotation/multi-select and enforcing width-only resize. Verify during the first rendering spike; the fallback is custom handles.
- Whether Leafer's export accepts non-uniform `size`; if not, use the offscreen stretch path.
- Whether `crypto.subtle` is available under the target Chrome `file://` setup; the FNV fallback covers it.
- How reliably `document.fonts.check` detects local fonts; treat it as advisory and always provide a fallback stack.
