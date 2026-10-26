# Tasks

## 1. Spec and docs sync

- [x] 1.1 Archive the completed `add-playlist-layout-generator` change so `category-layout` has a main spec baseline.
- [x] 1.2 Update `docs/歌单生成器需求.md` 第 43 行：自动列宽改为实测内容宽 + 等距间隙，说明 fallback、单列、手动拖动和不对 `g` 封顶。
- [x] 1.3 Run `openspec validate auto-column-gap-layout` and confirm the delta modifies `列宽` and `对齐与溢出警告` against the main spec.

## 2. Layout core

- [x] 2.1 Add `autoGapWidths(rawWidths, totalWidth)` in `js/layout.js`; keep `fitWidths` for manual and fallback.
- [x] 2.2 Wire `autoGapWidths` into `assignTableSongs`: auto vs manual, `contentWidths`, `cell.contentWidth`, `innerWidth`, `overflow`, `justifySpacing`; keep `cell.width/x` and `table.widths` as rendered widths.
- [x] 2.3 Handle edge cases: `n=1`, `Σa > W` fallback, `g=0`, empty table, empty columns, floating-point last-column absorption.
- [x] 2.4 Keep manual behavior: drag snapshots rendered widths (including auto gap), `widthMode='manual'`, block-width scaling, column-count reset, reset-auto.
- [x] 2.5 Update `js/render.js`: use `cell.contentWidth` for inner width, alignment, justify, clipping, and red cell; leave divider positions based on `table.widths`.
- [x] 2.6 Extend `Listify.layout.devChecks()` for the pure width cases and real-layout content width/equal-gap assertions.

## 3. Verification

- [x] 3.1 Mixed zh/en playlist, 3 columns: last column flush right; first `n-1` gaps equal; compare with the prototype numbers.
- [x] 3.2 Center/right/justify: gaps stay equal; no last-gap shrink; red cell only covers the content box.
- [x] 3.3 5 columns / 21 songs; a table with empty columns; a single-column table; an empty fixed table.
- [x] 3.4 Manual drag: freeze widths, auto gap rule off; resize the block and check proportional scaling; reset auto and column count.
- [x] 3.5 Shrink the table below `Σa` to trigger fallback; red cells; no crash.
- [x] 3.6 `file://` open, no console errors; export has no table lines/red cells.
- [x] 3.7 Update the requirements doc and re-read the delta spec against the implementation.

## Workflow follow-up

- After review and verification, archive the change with `openspec archive auto-column-gap-layout`.
