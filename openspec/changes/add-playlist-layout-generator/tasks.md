# Tasks

## 1. Vendor and scaffold

- [x] 1.1 Vendor pinned Leafer editor UMD and filter plugin under `vendor/`; verify by opening a smoke page from `file://` and confirming `window.LeaferUI` and the filter global are defined.
- [x] 1.2 Create `index.html`, `style.css`, and the `js/` file skeletons with classic script tags in load order; verify Chrome console has no 404/CORS/module errors.
- [x] 1.3 Create a blank Leafer app with a page-sized rectangle and viewport fit; verify the page renders centered on a gray canvas.
- [x] 1.4 Update `AGENTS.md` to "zero build + vendored Leafer UMD"; verify the constraints section no longer claims zero dependencies.
- [x] 1.5 Add `samples/` fixtures: UTF-8 with unclassified songs, GBK, and duplicate names; verify each file can be selected in the browser.

## 2. Domain model and pure layout

- [x] 2.1 Implement `model.js` with `Project` defaults, page/element factories, and asset store skeleton; verify a default project has one page and no elements.
- [x] 2.2 Implement virtual width (CJK/fullwidth=2, Latin=1) and stable ascending sort; verify with `Hi` (2), `Hello` (5), `真的爱你` (8) and equal-width ties.
- [x] 2.3 Implement table assignment for fixed/dynamic rows and column/row fill; verify 21 songs / 5 columns / dynamic rows = 5 rows and 4 empty cells.
- [x] 2.4 Implement auto-continuation and dynamic-last normalization; verify a full fixed table appends a dynamic table and a dynamic table below another freezes correctly.
- [x] 2.5 Implement text measurement, title wrapping, row height, and auto column widths; verify columns sum to table width and the longest song gets the largest share.
- [x] 2.6 Implement manual widths, proportional scaling on block width change, and reset on column count change; verify.
- [x] 2.7 Implement justify/center/right/left layout and red-cell detection; verify a single char falls back to center and an overlong song is flagged.
- [x] 2.8 Add `Listify.devChecks()` covering 2.2–2.7; verify all checks return pass in Chrome console.

## 3. Import and reconciliation

- [x] 3.1 Implement BOM/UTF-8/GB18030 decoding with manual override; verify UTF-8 BOM, GBK, and undecodable fixtures.
- [x] 3.2 Implement parser for `#` categories, unclassified songs, trimming, blank lines, and empty categories; verify with `samples/`.
- [x] 3.3 Implement duplicate validation with line numbers and atomic rejection; verify a duplicate file leaves the existing playlist unchanged.
- [x] 3.4 Implement re-import reconciliation by category name; verify same-name preserve, new unplaced, missing block delete, rename = new.
- [x] 3.5 Wire the import button and drag-drop to the parser; verify the category list updates and invalid imports show the error modal.
- [x] 3.6 Implement the re-import summary listing added/removed categories; verify it appears before committing.

## 4. Rendering and editor interactions

- [x] 4.1 Implement page view with background color, image fit modes, opacity, and blur; verify original/fill-width/fill-height/cover with a test image.
- [x] 4.2 Implement free text view with styles and double-click editing; verify add, edit, restyle, move, and per-page persistence.
- [x] 4.3 Implement free image view with cover/contain/stretch and opacity; verify add, resize, fit switch, and per-page persistence.
- [x] 4.4 Implement category block view with title and custom song grid; verify title wrap, row heights, alignment, clipped text, and edit-only borders/red cells.
- [x] 4.5 Implement z-order, layer panel selection, and background selection; verify overlapping elements and background properties.
- [x] 4.6 Implement overlay for page shadow, margin guides, and overflow badges; verify the overlay is outside the page container.
- [x] 4.7 Implement column divider handles and manual width dragging; verify widths update and red warnings appear.
- [x] 4.8 Implement page size and margin drag handles; verify numeric panel sync and global application.
- [x] 4.9 Configure the editor for single selection, no rotation, and width-only resize for blocks/text; verify behavior; if unsupported, implement fallback handles.

## 5. UI shell

- [x] 5.1 Build top bar, page tab strip, left sidebar tabs, property panel container, and modal shell; verify layout at 1280×800.
- [x] 5.2 Build category list with placed indicators, drag-to-canvas, and jump-to-placed-block; verify one block per category across pages.
- [x] 5.3 Build layer panel with up/down z-order controls; verify order changes on canvas.
- [x] 5.4 Build property panels for page/global, background, category block/tables, free text, and free image; verify each selection shows the right fields and edits update the canvas.
- [x] 5.5 Build page add/delete/switch and background inheritance dialog; verify last-page deletion is blocked.
- [x] 5.6 Build the encoding retry, import error, re-import summary, and delete confirmations; verify each modal path.

## 6. Persistence

- [x] 6.1 Implement image hashing with SHA-256 and FNV fallback, blob↔base64, and asset dedup; verify the same image twice produces one asset.
- [x] 6.2 Implement project save with only referenced assets and `version: 1`; verify the downloaded JSON contains playlist, pages, and base64.
- [x] 6.3 Implement project load with version/structure validation and asset reconstruction; verify a save→load round-trip preserves geometry, styles, tables, widths, z-order, and unplaced categories.
- [x] 6.4 Implement corrupt/missing asset handling; verify the current project is unchanged on failure.
- [x] 6.5 Implement unsupported-version rejection; verify a future version shows an error.

## 7. PNG export

- [x] 7.1 Build export dialog with width/height and aspect lock; verify default page size and custom 2160×3840.
- [x] 7.2 Implement page-container export with `editMode` off and image/font readiness; verify no borders, guides, red cells, or selection handles.
- [x] 7.3 Implement page-boundary clipping for overflow elements; verify the PNG contains only in-page content.
- [x] 7.4 Implement non-uniform size fallback via offscreen canvas; verify unlocked aspect export.
- [x] 7.5 Implement export failure handling and `歌单_第N页.png` filename; verify no partial download on image failure.

## 8. Integration verification

- [x] 8.1 Run the full flow in Chrome: import → arrange → table edit → save → reload → export; verify every spec scenario manually.
- [x] 8.2 Run `agent-browser` smoke checks for import, drag, page add, save, load, and export; verify no console errors.
- [x] 8.3 Re-read `specs/` and confirm each requirement has an observable implementation; record any gaps.
- [x] 8.4 Verify `file://` operation with no network (disable network) and no build artifacts.

## Workflow follow-up

- After review, archive the change with `openspec archive add-playlist-layout-generator`.
