# Design

## Context

图片尺寸目前散落在 `js/render.js`、`js/app.js`、`js/app-chrome.js`、`js/app-interactions.js`、`js/ui-property-panel.js` 与 `js/project-io.js`，统一读取 `img.naturalWidth || img.width`。对无 `width`/`height` 的 SVG，浏览器返回默认 300×150 替换元素框（示例为 300×65），因此所有派生几何都偏小。

进一步地，`viewBox` 往往大于实际绘制内容：图形只占左上角时，按 `viewBox` 计算会把大量空白当成图片。并且 Chromium 对无 `width`/`height` 的 SVG 使用 9 参数 `drawImage` 取样时结果不可靠（同一图片按 `0,0,150,150` 取样可能得到透明画布，而 5 参数绘制正常），因此不能只改逻辑尺寸，还必须把内容裁剪成稳定的位图取样源。

运行时保持零构建、经典脚本和 `file://` 直开；`js/assets.js` 位于依赖链底层，`render`、`project-io` 与 `app` 都可访问 `L.assets`，且 Node 回归装载器会按 `index.html` 顺序加载它。

## Goals / Non-Goals

**Goals:**

- 在资产层解析并缓存 SVG 内在尺寸，使解码后的图片在任何调用方看来都有正确的原图宽高。
- 当绘制内容没有铺满 `viewBox` 时，用 `getBBox()` 得到真实内容边界，并把它作为逻辑原图尺寸。
- 把内容边界烘焙成稳定的位图取样源，避免浏览器对 SVG `drawImage` 取样不一致。
- 用单一访问器替换所有 `naturalWidth`/`naturalHeight` 读取，避免遗漏。
- 让 Node 回归用例直接覆盖真实 SVG 样本与单位/回退规则，内容边界与取样源在浏览器端到端验证。

**Non-Goals:**

- 不改变光栅图片行为、项目 JSON 结构、资产哈希或持久化格式。
- 不改变 480px 长边插入上限，也不让 SVG 自动铺满页面。
- 不实现完整 SVG 布局（嵌套 SVG、CSS 尺寸、外部资源、滤镜/阴影边界计算）。
- 不把 SVG 转换成可编辑的矢量元素；内容边界只影响“原图尺寸”和取样源。

## Decisions

### 1. 解析器放在 `js/assets.js`，只解析根 `<svg>` 标签

`assets.js` 是最底层且已被 Node 装载器加载，新增逻辑不会引入模块依赖或构建步骤。解析只做两件事：定位根标签、读取 `width`/`height`/`viewBox`。使用引号感知的扫描而不是 `DOMParser`，因为后者在 Node 沙箱中不可用，且完整 XML 解析对需求过重。根标签内的 `>` 可能出现在属性值中，扫描必须跳过引号内容。

尺寸规则：

1. 绝对 `width` 与 `height` 都有效 → 直接使用；
2. 否则解析 `viewBox` 的第三、四个数（允许逗号/空白分隔与科学计数法，如 `5e3`）；
3. 只有一个绝对尺寸且有有效 `viewBox` → 按 `viewBox` 比例推导另一边；
4. 否则返回 `null`，调用方保留浏览器解码尺寸。

绝对单位仅支持 CSS 绝对单位（`px/pt/pc/mm/cm/in/q`），按 96dpi 换算；百分比、`em`、`rem`、`vw` 等相对单位返回 `null`，避免把未知基准当成像素。

替代方案：在 `render.js` 或 `app.js` 里解析。否决，因为 `project-io` 和属性面板也需要，放在上层会造成重复实现并违反“工具函数唯一实现”。

### 2. 把结果附着在图片对象上，而不是资产元数据

新增 `setImageSize(img, size)`，把 `{ width, height }` 写到 `img.__listifyNatural`；`imageSize(img)` 优先返回该值，否则回退 `naturalWidth || width`。图片对象在 `assets.images`、`project-io` 的临时图片表和 `installAssets` 换表后始终跟随图片，不需要同步另一份 Map；也不会改变项目 schema 或资产 meta。

替代方案：在 `assets.meta` 增加 `naturalWidth` 字段。否决，因为 meta 会进入项目序列化/校验边界，且临时图片在 `buildProject` 中尚未安装到 `assets`；图片对象属性更局部、无迁移成本。

### 3. 解码完成前应用尺寸

`assets.loadImage(id)` 在 `onload` 后、resolve 前调用 `svgBlobSize(blob, name)` 并 `setImageSize`；`project-io.loadImageFromBlob(blob, name)` 做同样处理，`buildProject` 传入 `asset.name`。这样所有调用方拿到的图片已经带正确尺寸，无需各自等待或重复解析。解析失败静默回退，不影响图片加载。

### 4. 单一访问器替换全部读取点

`L.assets.imageSize(img)` 成为唯一入口：

- `js/render.js` 的本地 `imageSize` 委托给它，`backgroundGeometry` 使用返回值；
- `js/app.js` 的 `cachedNatural`、`buildFreeImageElement`、`normalizeImageRatio`；
- `js/app-chrome.js` 的背景裁剪参考线；
- `js/app-interactions.js` 的 `frameFromVisible`；
- `js/ui-property-panel.js` 的裁剪字段、裁剪摘要、背景/内容图片属性；
- `js/project-io.js` 的 `migrateImageRect` 输入。

不改变各调用点的几何公式，只替换尺寸来源。

### 5. 内容边界用 `getBBox()`，取样用烘焙位图

`svgContentBox(text)` 用 `DOMParser` 解析 SVG，把根节点导入一个隐藏宿主（`position:absolute; left:-99999px; width:1px; height:1px; overflow:hidden`），等待 `document.fonts.ready` 后调用 `getBBox()`。`getBBox()` 只返回几何边界，不包含描边，因此遍历元素读取计算后的 `stroke-width`，按最大值的一半向外扩展；再把结果夹取到 `viewBox`，因为 SVG 视口会裁掉视口外内容。内容宽高均达到 `viewBox` 的 99% 时返回 `null`，表示不裁剪，避免示例这类几乎铺满的图形因浮点误差改变尺寸。宿主在 `finally` 中移除，失败一律返回 `null`。

仅改逻辑尺寸还不够：示例 SVG 的逻辑尺寸是 5000×1081.5，但 `<img>` 解码尺寸只有 300×65。Chromium 对无 `width`/`height` 的 SVG `<img>` 使用 9 参数 `drawImage` 时，会把源矩形按目标尺寸解释，而不是按内在像素；实测把源矩形 `0,0,300,65` 画到 480×104 只显示约 62.5% 的内容并放大约 1.6 倍，而同一 SVG 用 5 参数绘制正常。因此不能依赖 SVG `<img>` 的 9 参数取样，`rasterizeSvg(img, info)` 在解码后把 SVG 内容绘制到画布：

1. 用 `svgViewportMap(viewBox, naturalWidth, naturalHeight, preserveAspectRatio)` 得到 `viewBox → <img>` 像素的缩放与留边；
2. 把 `<img>` 的完整区域换算回 `viewBox` 用户坐标（`imageRect`）；
3. 以内容边界（内容接近铺满时为整个 `viewBox`）为画布坐标原点，用统一缩放绘制 `imageRect`；
4. 逻辑尺寸仍为内容边界或 `viewBox`（`viewBox` 用户单位），取样源为整张画布。

画布最多放大 4 倍（小图标导出不糊），长边不超过 4096px，总像素不超过 8M，避免超大 `viewBox` 分配过多内存。返回的画布通过 `setImageSize(canvas, natural, source)` 带上 `__listifyNatural` 与 `__listifySource`，`assets.images` 直接缓存画布；`imageSourceRect` 再把裁剪后的逻辑坐标换算到画布像素。内容接近铺满时 `content` 为 `null`，逻辑尺寸仍保持 `viewBox` 尺寸，但仍以 `viewBox` 作为烘焙范围；否则原始 SVG `<img>` 的 9 参数取样会再次放大并只显示左上角。

替代方案：只用 `getBBox()` 改逻辑尺寸。否决，因为 9 参数 `drawImage` 在无 `width`/`height` 的 SVG 上不可靠，会出现内容不可见或取样错位。替代方案：把 SVG 转成 data URL 再解码。否决，增加一次编解码且仍受浏览器 SVG 尺寸规则影响。

### 6. 测试直接读取真实样本

新增 `scripts/checks/svg-size.test.js`，用 `fs` 读取 `samples/gdj-divider-8799234.svg`，通过 `scripts/checks/loader.js` 加载运行时。覆盖：示例 viewBox、显式宽高优先、cm 换算、百分比回退、单边推导、无 viewBox 回退，`setImageSize` 覆盖浏览器 300×65、`imageSize(null)` 返回 0×0，以及 `imageSourceRect` 的逻辑裁剪映射、`svgImageMetrics` 的内容边界取样框、`svgViewportMap` 的 `preserveAspectRatio` 留边。由于 vm 跨 realm 对象原型不同，逐字段断言而不是深比较；`getBBox()` 与画布烘焙依赖浏览器 DOM，放在浏览器端到端验证。

## Risks / Trade-offs

- [轻量解析器无法覆盖所有合法 SVG] → 只读取根标签的简单属性；任何异常或未知单位返回 `null`，回退浏览器尺寸，保持现有行为而不是报错。
- [现有项目中的 SVG 背景会改变显示尺寸] → 这是修正目标；元素自身存储的 x/y/width/height 不被改写，只有依赖原图尺寸的 fit/裁剪/摘要重新计算。
- [图片对象属性不是正式 API] → 仅由 `L.assets` 读写，命名带 `__listify` 前缀；不进入序列化，避免被误当项目字段。
- [解析异步化可能改变加载时序] → 只在 `onload` 后追加一次 `blob.text()`，失败也 resolve；`pending` 仍保证同一资产只解析一次。
- [科学计数法/逗号分隔的 viewBox] → 用数值正则而非 `split(' ')`，并验证宽高为有限正数。
- [`getBBox()` 不含描边、滤镜与阴影] → 描边按最大 `stroke-width/2` 手动外扩；滤镜/阴影暂不纳入，属于已知限制，避免过度裁剪或引入复杂 SVG 效果计算。
- [内容边界会裁掉设计上的留白] → 这是需求目标；99% 阈值只保护几乎铺满的图形，不保护刻意留白。若后续需要保留留白，应提供“按 viewBox 显示”的显式选项，而不是改变默认。
- [烘焙位图有内存成本] → 最多 4 倍、4096 长边、8M 像素；内容接近铺满时不烘焙，示例仍走原始 `<img>`。
- [`getBBox()` 需要布局] → 使用隐藏宿主并等待字体就绪，`finally` 移除；失败回退内在尺寸，不阻止图片加载。

## Migration Plan

无数据迁移。发布后重新加载项目或草稿时，SVG 资产会按新规则得到内在尺寸/内容边界并重新烘焙取样源；项目文件、资产哈希与已有元素几何保持不变。回滚只需还原代码，不涉及存储格式。
