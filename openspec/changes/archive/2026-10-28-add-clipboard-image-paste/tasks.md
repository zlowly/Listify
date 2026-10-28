# Tasks

## 1. Clipboard module and script wiring

- [x] 1.1 Create `js/clipboard-image.js` exposing `L.clipboardImage.read(event)`: iterate `clipboardData.items` by index (the list is array-like), keep only `kind === 'file'` entries whose `type` starts with `image/`, call `getAsFile()`, and return `{ blob, name, mime }`; fall back to `clipboardData.files` only when items produce no image. Verify in the console with a synthetic event containing one image item, one text item and one image file that only the two image entries are returned without duplicates.
- [x] 1.2 Add `L.clipboardImage.install(options)` in the same file: install one `document` `paste` listener, call `options.shouldHandle(event)` first, read images, return without `preventDefault()` when none are found, and otherwise prevent default and call `options.onImages(images, event)`; return an uninstall function. Verify installing and uninstalling leaves normal text paste unchanged.
- [x] 1.3 Add `<script src="js/clipboard-image.js"></script>` to `index.html` before `js/app.js`; verify `window.Listify.clipboardImage.read` and `.install` exist in the console after loading the page.

## 2. Shared free-image insertion and paste flow

- [x] 2.1 In `js/app.js`, extract `loadFreeImageAsset(file, name)` (asset hash, decode, `model.ensureAssetMeta`) and a reusable new-element builder from `handleFreeImageFile`; keep `pendingImageElementId` replacement behavior, `keepRatio` normalization and the existing size rule (natural ratio, long edge ≤ 480px, minimum 40px, page center). Verify adding via the file picker still places a 1200×800 image at 480×320 in the center, and replacing keeps the element width and center.
- [x] 2.2 In `js/app.js`, add `handlePastedImages(images)`: capture the target page id at paste time, wrap each nameless clipboard blob in a `File` with a readable generated name, insert every decodable image as a new element offset by `index * 24px`, render once, select the last inserted element and switch back to the target page if the user changed pages during loading. Verify in the console with three generated `File` objects that three elements appear at 0/24/48px offsets and the last is selected.
- [x] 2.3 In `js/app.js`, make pasted-image failures per image: a corrupt image must not create an element or block the other images, and all-corrupt input must leave the page unchanged. Show `已粘贴图片。`, `已粘贴 N 张图片。`, `已粘贴 N 张图片，M 张失败。` or `粘贴图片失败：<message>` as appropriate. Verify with one valid and one corrupt blob, then with only a corrupt blob.
- [x] 2.4 In `app.init()`, install the clipboard listener with a guard that rejects when the paste target or active element is `input`/`textarea`/`select`/`contenteditable`, when `#modal-root` is visible, or when there is no current page; wire accepted images to `handlePastedImages`. Verify pasting a screenshot on the canvas adds it, while pasting into a property input, the inline text editor or an open modal never inserts an image.

## 3. Entry hint and documentation

- [x] 3.1 In `index.html`, add `title="添加图片（也可 Ctrl+V 粘贴）"` to `#btn-add-image` without changing the toolbar layout; verify the tooltip appears on hover and the button still opens the file picker.
- [x] 3.2 Update `docs/歌单生成器需求.md` in the 自由图片 section to state that images can be added by `Ctrl + V` from the clipboard, that pasting adds a new image rather than replacing the selection, and that multi-image pastes are offset and selected last; verify the wording matches `specs/page-editor/spec.md`.

## 4. Integration verification

- [x] 4.1 Open `index.html` via `file://`, import a playlist and paste a real screenshot: confirm the image uses the 480px long-edge rule, is centered on the current page, is selected, and appears in the layer list. Save the project, inspect that the JSON embeds the pasted asset, reload it, and confirm the image and its transforms survive; export the page and confirm the image is included.
- [x] 4.2 Repeat the paste while focus is in a property input, in the inline text editor, and while the export/new-page modal is open; confirm no image is inserted and normal text paste still works. Paste plain text on the canvas and confirm nothing is blocked or added.
- [x] 4.3 Copy several image files from the file manager and paste them at once; confirm all appear, the 24px cascade is visible, and only the last is selected. Repeat with one corrupt image and confirm the valid images still insert and the error is reported.
- [x] 4.4 Run `openspec validate add-clipboard-image-paste --strict` and confirm the proposal, delta spec, design and tasks are accepted.

## Workflow follow-up

- Archive the change after review and manual verification pass.
