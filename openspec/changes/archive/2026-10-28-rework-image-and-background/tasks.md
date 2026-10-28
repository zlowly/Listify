# Tasks

## 1. Image model and persistence

- [x] 1.1 In `js/model.js`, replace the image element's `fit` with `keepRatio` (default `true`), `rotation` (default `0`) and `blur` (default `0`); keep `opacity`. Verify in the console that `model.createImageElement(project, null)` has no `fit` key and returns the three defaults.
- [x] 1.2 In `js/model.js`, add a background owner resolver that follows `page.backgroundRef` to the owning page, with a visited set to reject cycles; add a helper to clone a background for detach/materialize. Verify with three pages where pages 2 and 3 reference page 1: both resolve to page 1, and a hand-made cycle returns no owner.
- [x] 1.3 In `js/io.js` and `js/model.js`, serialize version `2` with `keepRatio` / `rotation` / `blur` on images and `backgroundRef` on pages, and make the default project version `2`; owners write `background`, references write only `backgroundRef`. Verify a saved JSON has one background object for a linked group and reloading restores the same values.
- [x] 1.4 In `js/io.js`, accept version `1` and migrate images: `stretch` keeps the rect with `keepRatio:false`, `contain` shrinks to the contained image rect with `keepRatio:true`, `cover` expands to the covering image rect with `keepRatio:true`; use the already-decoded asset's natural dimensions, fall back to the saved rect if the asset is missing, and set `rotation:0` / `blur:0` while marking v1 pages as background owners. Verify with a hand-made v1 JSON containing all three fit values.
- [x] 1.5 In `js/io.js`, validate v2 image values (`keepRatio` boolean, finite `rotation`, `blur >= 0`, `opacity` in 0–1) and background references (target page exists, one owner, no cycle); reject invalid files without replacing the current project. Verify a JSON with a missing `backgroundRef` target is rejected.

## 2. Rendering and geometry

- [x] 2.1 In `js/render.js`, rewrite `drawFreeImage` to translate/rotate around the element center, clip to the rotated rect, apply `opacity`, set `ctx.filter` when `blur > 0`, and draw the image stretched to the rect. Verify a 45° rotated image with blur renders rotated and clipped at its own edges.
- [x] 2.2 In `js/render.js`, make `hitTest` inverse-rotate the point into image-local coordinates and use the rotated rectangle for image elements; keep category/text behavior unchanged. Verify clicking inside a 45° image selects it and clicking its AABB corner outside the image does not.
- [x] 2.3 In `js/render.js`, add rotated-corner and AABB helpers and use the four corners for `pageOverflow` on images; keep category/text overflow as-is. Verify a rotated image whose corner leaves the page reports overflow while its center remains inside.
- [x] 2.4 Confirm `drawPage`/`export.js` need no separate transform path: export a page with a rotated, blurred, semi-transparent image and verify the PNG matches the canvas and is clipped to the page.

## 3. Selection and scaling interaction

- [x] 3.1 In `js/app.js`, rotate the selection rect and eight handle positions by the element angle, and inverse-transform pointer positions in `handleAt`. Verify selecting a 30° image shows handles on the rotated corners and each handle is draggable.
- [x] 3.2 In `js/app.js`, replace `resizeDrag`'s screen-axis math for images with: inverse-rotate the pointer delta, compute new width/height by handle, then place the element so the opposite anchor stays fixed in page space. Verify at 0°, 45° and 180° that dragging a corner keeps the opposite corner in place.
- [x] 3.3 In `js/app.js`, implement `keepRatio`: corner drags use the diagonal projection, edge drags derive the other dimension, and the 40px minimum still clamps. Verify a 400×300 image stays 4:3 with the lock on and can be stretched to 400×200 with it off.
- [x] 3.4 In `js/app.js`, normalize on lock-on and on image replacement: keep the center and width, set height from the image's natural ratio; if the image is not loaded yet, normalize after load. Verify toggling the lock on a 400×200 distorted image yields 400×300 for a 4:3 image with the center unchanged.
- [x] 3.5 In `js/app.js`, update the new-page flow to create a reference (`backgroundRef` to the current page's owner, shared object) or an independent default background. Verify a new page created with “引用上页背景” shares the object and editing either page changes both.

## 4. Background reference lifecycle

- [x] 4.1 In `js/app.js`, implement “断开引用”: clone the resolved background into the page, clear `backgroundRef`, and let the page become an owner. Verify the detached page keeps its look and later source changes no longer affect it.
- [x] 4.2 In `js/app.js`, handle page deletion: before removing an owner, materialize every page whose `backgroundRef` targets it (clone background, clear ref); then delete. Verify deleting page 1 in a 1→2→3 linked group leaves pages 2 and 3 with the same look and independent copies.
- [x] 4.3 In `js/app.js`, update the new-page dialog label and hint to “引用上页背景” and explain that changes stay in sync and can be detached. Verify the dialog text matches the new behavior.
- [x] 4.4 In `js/ui.js`, show the reference state in the background panel (“引用第 N 页背景”, “被 N 页引用”) with a “断开引用” button on references; keep the existing size-mode, opacity, blur and fill-color controls editable. Verify editing a referenced page updates the owner's panel values and vice versa.

## 5. Image property panel and layer list

- [x] 5.1 In `js/ui.js`, replace the image “填充” group with: “缩放时保持比例” checkbox, rotation number input (degrees, normalized to `(-180, 180]`), and blur range; bind them to the element and `L.app.changed({ property: false })` without re-rendering the panel. Verify dragging a slider updates the canvas live and keeps focus.
- [x] 5.2 In `js/ui.js`, update the image layer row subtitle to stop showing `fit` (use rotation or “图片”), and show the background row as “引用 · 第 N 页” for references. Verify the layer list no longer prints cover/contain/stretch.
- [x] 5.3 Add compact styling for the new checkbox/rotation row in `style.css`; verify the 58px label column does not overflow at narrow panel widths.
- [x] 5.4 Update `docs/歌单生成器需求.md` to describe the new image model (no fill modes, ratio lock, rotation, blur) and background references (including detach and delete behavior); verify the wording matches the delta specs.

## 6. Integration verification

- [x] 6.1 Open `index.html` via `file://`, add a playlist and an image, then exercise lock on/off, rotation at 30°/45°/90°, all eight handles, hit testing, overflow warning, blur and opacity; verify the canvas, selection box and handles stay consistent.
- [x] 6.2 Create page 2 with “引用上页背景”, change the image/opacity/size mode on page 1, confirm page 2 follows, then change page 2 and confirm page 1 follows; detach page 2 and confirm it stops following.
- [x] 6.3 Delete the owner page in a linked group and confirm the remaining pages keep the same background as independent copies; save and reload, then confirm references still sync.
- [x] 6.4 Load a version 1 project with `stretch`, `contain` and `cover` images, verify the migration rules and that the project can be re-saved as version 2; export a rotated/blurred image page to PNG and verify the result.
- [x] 6.5 Run `openspec validate rework-image-and-background --strict` and confirm the delta specs, design and tasks are accepted.

## Workflow follow-up

- After review and verification, archive the change with `openspec archive rework-image-and-background`.
