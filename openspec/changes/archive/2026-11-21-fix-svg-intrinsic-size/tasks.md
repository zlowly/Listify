# Tasks

## 1. 资产层解析与测试

- [x] 1.1 新建 `scripts/checks/svg-size.test.js`，用 `fs` 读取 `samples/gdj-divider-8799234.svg`，覆盖示例 viewBox、显式宽高优先、`cm` 换算、百分比回退、单边推导、无 viewBox 回退、`setImageSize` 覆盖与 `imageSize(null)`；验证：`node --test scripts/checks/svg-size.test.js` 在实现前失败、实现后通过。
- [x] 1.2 在 `js/assets.js` 实现 `svgLengthPx`、`svgRootTag`、`svgAttributes`、`svgIntrinsicSize`、`looksLikeSvg`、`svgBlobSize`、`setImageSize`、`imageSize` 并挂到 `L.assets`；验证：1.1 的解析用例通过。
- [x] 1.3 在 `assets.loadImage` 的 `onload` 后解析 SVG 并 `setImageSize`，再写入 `images` 并 resolve；验证：测试用伪造 `Image`（`naturalWidth=300`、`naturalHeight=65`、`src` setter 触发 `onload`）加载示例资产，断言 `L.assets.imageSize(img)` 为 5000×1081.5。

## 2. 统一尺寸读取

- [x] 2.1 `js/render.js`：`imageSize` 委托 `L.assets.imageSize`，`backgroundGeometry` 使用其返回值；验证：测试用带 `__listifyNatural` 的图片对象断言 `backgroundGeometry` 的 `original`/`fill-width`/`cover` 结果，并运行 `node --test scripts/checks/svg-size.test.js`。
- [x] 2.2 `js/app.js`、`js/app-chrome.js`、`js/app-interactions.js`、`js/ui-property-panel.js` 的 `naturalWidth`/`naturalHeight` 读取全部改为 `L.assets.imageSize`；验证：`grep -rn "\.naturalWidth\|\.naturalHeight" js | grep -v presets-data` 只剩 `js/assets.js`，且 `node --test scripts/checks/*.test.js` 通过。
- [x] 2.3 `js/project-io.js`：`loadImageFromBlob(blob, name)` 在 `onload` 后应用 SVG 尺寸，`buildProject` 传入 `asset.name`，`migrateImageRect` 输入改用 `L.assets.imageSize(decoded)`；验证：测试调用 `L.projectIo.loadImageFromBlob` 加载示例 Blob，断言返回图片经 `L.assets.imageSize` 得到 5000×1081.5。

## 3. 内容边界与取样源

- [x] 3.1 在 `js/assets.js` 实现 `svgContentBox`（`DOMParser` + 隐藏宿主 + `getBBox()` + 描边外扩 + `viewBox` 夹取 + 99% 不裁剪阈值），并让 `svgBlobSize` 返回 `viewBox`/`content`/`preserveAspectRatio`；验证：浏览器中 `viewBox="0 0 1000 1000"`、`rect 100×50` 返回内容边界 `{x:10,y:20,width:100,height:50}`，示例 SVG 因接近铺满返回 `null`。
- [x] 3.2 在 `js/assets.js` 实现 `svgViewportMap`、`svgImageMetrics`、`rasterizeSvg`、`imageSource`、`imageSourceRect`；`rasterizeSvg` 把内容边界烘焙成画布，受 4 倍/4096 长边/8M 像素约束；验证：合成 SVG 生成 400×200 画布，逻辑尺寸 100×50，整块红色内容填满。
- [x] 3.3 `assets.loadImage` 与 `project-io.loadImageFromBlob` 在解码后优先使用 `rasterizeSvg` 的画布，失败再回退 `svgImageMetrics`；`js/render.js` 的 `drawProcessedImage`、`processedImage`、`drawOneShotImage` 全部通过 `L.assets.imageSourceRect` 取样；验证：合成 SVG 内容层绘制 100×50 全红、外部透明，示例 SVG 内容仍可见。
- [x] 3.4 浏览器验证内容边界：合成 SVG 插入为 100×50 并居中，背景 `original` 矩形 100×50 居中，裁剪左 10 后可见 90×50，源取样框 `x=40,width=360`；示例 SVG 仍为 5000×1081.5，因内容接近铺满不裁剪。
- [x] 3.5 回归：刷新草稿后合成 SVG 缓存为 `CANVAS` 400×200、示例 SVG 仍为 `IMG` 300×65 且逻辑 5000×1081.5；光栅图片与背景行为不变。

## 4. 端到端验证

- [x] 4.1 浏览器打开 `index.html`，通过“添加图片”选择示例 SVG；验证：元素约为 480×104、位于当前页中心、等比锁定开启，而不是 300×65。
- [x] 4.2 把同一 SVG 设为背景并选择 `original`；验证：背景矩形为 5000×1081.5 且居中；再切换 `fill-width` 与 `cover`，比例与内在尺寸一致。
- [x] 4.3 选中该 SVG 查看裁剪摘要与边界；验证：原图尺寸显示 5000×1081.5；保存项目后重新导入，或刷新后从草稿恢复，尺寸仍为 5000×1081.5。
- [x] 4.4 回归光栅图片；验证：添加 1200×800 PNG 仍插入为 480×320，背景 `original` 仍为 1200×800 居中，行为与改动前一致。

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived specs and change status.
