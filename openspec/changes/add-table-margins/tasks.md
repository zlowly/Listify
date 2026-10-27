# Tasks

## 1. Data model and persistence

- [x] 1.1 In `js/model.js`, add `DEFAULT_TABLE_MARGINS` and `normalizeMargins()`, and include a fresh `margins` object in `createTable`; verify via a console check that `model.createTable().margins` is `{top:0,right:0,bottom:0,left:0}` and that `normalizeMargins(undefined)` / negative / `NaN` return zeros without sharing references.
- [x] 1.2 In `js/io.js`, serialize `margins`, load them through `model.normalizeMargins`, and accept missing `margins` while rejecting present-but-invalid values; verify an old project JSON without `margins` loads with zeros and a save → load round-trip preserves non-zero margins.

## 2. Layout geometry

- [x] 2.1 In `js/layout.js`, compute per-table `x`, `tableWidth` from left/right margins and clamp to a 40px minimum inside the block; verify with a 600px block and 40/60 margins that `x=40`, `tableWidth=500`, and the last column's right edge is at 540.
- [x] 2.2 Stack tables using additive top/bottom margins and include the last table's bottom margin in `blockHeight`; verify first-table top = title bottom + top margin, a 20/30 pair produces a 50px gap, and `blockHeight` grows by the last bottom margin.
- [x] 2.3 Update `normalizeTables` and `addTable` to copy the previous table's `margins` as a separate object for auto-continued and user-added tables; verify changing the new table's margin leaves the source table unchanged.
- [x] 2.4 Keep manual column widths working with the reduced table width: `fitWidths` receives `W`, block-width changes keep margins fixed and scale fixed widths before normalization; verify by dragging a divider, resizing the block, and comparing the sum of widths to `W`.
- [x] 2.5 Extend `Listify.layout.devChecks()` with default-zero geometry, left/right inset, additive vertical gap, first top margin, last bottom margin, oversized margins, margin normalization, and margin copying assertions; verify `devChecks().pass === true` and all existing checks still pass.

## 3. Rendering and interaction

- [x] 3.1 Update `js/render.js` so red cells, cell clipping, table border/row lines, and column dividers use each table's own `x` and `tableWidth` instead of the layout-level `tableX` / `tableWidth`; verify a page with two tables having different left margins draws each frame at its own inset.
- [x] 3.2 Update `renderer.tableDividers` (and any divider consumers) to return absolute coordinates based on `table.x` and `table.y`; verify the divider is drawn on the visible column boundary and dragging still freezes the table into manual width mode.

## 4. Property panel and documentation

- [x] 4.1 In `js/ui.js`, add the table-card margin row with 2×2 numeric inputs for 上/右/下/左, normalize before writing, and trigger `L.app.changed({ property: false })` without re-rendering the panel; verify typing a top margin moves the table immediately and keeps input focus.
- [x] 4.2 Add `.table-margin-grid` styling in `style.css` so the four compact inputs fit the 58px label column at narrow panel widths; verify no horizontal overflow and labels remain readable.
- [x] 4.3 Update `docs/歌单生成器需求.md` 的表格属性列表，加入“上下左右边距（各表格独立，px，默认 0，上下边距相加）”；verify the wording matches `specs/category-layout/spec.md`.

## 5. Integration verification

- [x] 5.1 Open `index.html` via `file://`, import a playlist, place one category block, and exercise three tables with independent margins; verify inter-table gaps, left/right insets, and block bottom spacing match the inputs and page overflow warning still works.
- [x] 5.2 Load an existing project saved before this change, confirm zero margins and identical layout, then save and reload to confirm margins persist.
- [x] 5.3 Export the edited page to PNG and confirm no margins create visible borders/red cells and that table content sits at the inset positions shown in the editor.
- [x] 5.4 Run `openspec validate add-table-margins --strict` and confirm the delta spec, design, and tasks are accepted.

## Workflow follow-up

- After review and verification, archive the change with `openspec archive add-table-margins`.
