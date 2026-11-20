# Proposal

## Why

无 `width`/`height` 属性的 SVG 被浏览器解码为默认 300×150 替换元素框，应用把 `naturalWidth`/`naturalHeight`（例如示例文件为 300×65）当作原图尺寸，导致插入图片过小、背景 `original` 定位尺寸错误，裁剪与属性面板也以错误尺寸为基准。

## What Changes

- 在资产层集中解析 SVG 内在尺寸：优先使用根 `<svg>` 的绝对 `width`/`height`（含 `px/pt/pc/mm/cm/in/q` 单位换算），否则使用 `viewBox` 宽高；只有单边绝对尺寸时按 `viewBox` 比例推导另一边；无法解析时回退浏览器解码尺寸。
- 当 SVG 的实际绘制内容没有铺满 `viewBox` 时，用 SVG DOM 的 `getBBox()` 取真实内容边界（按最大 `stroke-width` 外扩并夹取到 `viewBox`），以内容边界作为逻辑原图尺寸；内容接近铺满（宽高均 ≥99%）时保持 `viewBox` 尺寸，避免浮点误差改变已有结果。
- SVG 内容（含铺满 `viewBox` 的情况）在解码阶段烘焙成位图取样源，按 `preserveAspectRatio` 映射 `viewBox` 到实际像素；这样无 `width`/`height` 的 SVG 在 `drawImage` 取样时不会因浏览器把源矩形按目标尺寸解释而放大或丢失内容。位图最多放大 4 倍，并受 4096 长边与 8M 像素预算约束。
- 解码图片时把 SVG 内在/内容尺寸附着到图片对象，使插入默认几何、背景 fit 计算、裁剪边界与摘要、属性面板、项目导入/草稿恢复共用同一尺寸。
- 光栅图片行为保持不变。
- 新增零依赖 Node 回归用例，使用仓库中的真实 SVG 样本覆盖解析与回退规则；内容边界与位图取样源在浏览器中端到端验证。

## Capabilities

### New Capabilities

- `image-intrinsic-size`: 定义图片内在尺寸的来源，特别是无 `width`/`height` 的 SVG 如何从根标签属性与 `viewBox` 推导、如何裁剪到实际绘制内容边界，以及所有依赖原图尺寸的功能必须使用同一结果。

### Modified Capabilities

- `page-editor`: 自由图片（含文件选择与粘贴）的默认插入几何对 SVG 使用内在尺寸或内容边界，而非浏览器默认 300×150 框。
- `background-layer`: `original`/`fill-width`/`fill-height`/`cover` 背景定位对 SVG 使用内在尺寸或内容边界计算矩形。
- `image-crop`: SVG 的“原图宽/高”取内在尺寸或内容边界，裁剪像素单位、边界与摘要随之变化。

## Impact

- 代码：`js/assets.js`、`js/render.js`、`js/project-io.js`、`js/app.js`、`js/app-chrome.js`、`js/app-interactions.js`、`js/ui-property-panel.js`。
- 测试：新增 `scripts/checks/svg-size.test.js`，复用 `scripts/checks/loader.js` 与 `samples/gdj-divider-8799234.svg`。
- 不改变项目 JSON 结构、资产哈希、持久化格式、运行时依赖或零构建约束；光栅图片与现有项目行为不变。
