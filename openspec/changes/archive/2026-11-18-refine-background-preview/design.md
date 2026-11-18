# Design

## Context

现有缩略图由 `ui-property-panel.js` 与 `ui-pickers.js` 各自拼一小段 HTML：找到第一张已加载的背景图，用 `object-fit: cover` 裁进固定框。画布背景则由 `render.drawBackground` 按填充色、全部图片、定位模式、效果与旋转绘制，两条路径没有共用逻辑。

背景数据是纯值：`page.background = { color, images[] }`，图片只引用 `assetId`。全局背景是活动指针，`model.effectiveBackground` 总是返回来源页背景；缩略图需要强制显示本页背景，而画布和导出继续使用有效背景。

属性面板每次 `ui.renderAll` 都整体重建（`ui.js:393`），画布拖拽帧只走 `scheduleRedraw`，松手后调用 `ui.renderAll`（`app-interactions.js:419`）。

## Goals / Non-Goals

**Goals:**

- 缩略图与画布背景使用同一套合成实现，效果参数不再各写一份。
- 预览保持页面比例，横竖版都完整可见。
- 页面背景分组与「复制背景…」弹窗共享同一个绘制辅助。
- 页面级属性不再出现无效删除控件。

**Non-Goals:**

- 不在拖拽的每一帧刷新缩略图；松手后的 `renderAll` 足够。
- 不引入离屏 Worker、OffscreenCanvas 或新的图片缓存层。
- 不改变图片资产去重、草稿存储、项目格式或导出路径。
- 不为缩略图新增设置项（尺寸、开关）。

## Decisions

### D1: 小画布 + 复用 `drawBackground`，而不是 CSS 重建

把 `render.drawBackground` 的绘制体抽成 `paintBackground(ctx, pageSize, background, options)`：接受显式 `background`，不再自行取有效背景。公开的 `drawBackground` 仍先取 `model.effectiveBackground`，画布与 PNG 导出行为不变；预览调用 `paintBackground` 并传 `page.background`。

预览流程：

```
canvas 尺寸 = CSS 框尺寸 x min(devicePixelRatio, 2)
k = min(canvas.width / page.width, canvas.height / page.height)
ctx.translate((W - pageW*k)/2, (H - pageH*k)/2)
ctx.scale(k, k)
render.paintBackground(ctx, project.pageSize, page.background)
```

`drawBackground` 内部的页面裁剪、定位几何、透明度、模糊、调色与渐隐全部原样生效。`contextRatio(ctx)` 读到的是 `k`，离屏效果位图会按缩略图尺寸烘焙，命中现有 12MP LRU。

备选：
- CSS 多层绝对定位：要重写 fit 几何、旋转、模糊和渐隐掩膜，必然与画布漂移，否决。
- 首图 + CSS 滤镜：多图顺序、定位和渐隐仍不真实，否决。
- 直接给整页截图再缩小：需要跨模块读 viewport 画布，页面切换/多页弹窗成本高，且会截到内容层，否决。

### D2: 画布元素在 HTML 插入后绘制

预览片段输出 `<canvas class="bg-preview" data-preview-page="<pageId>">`，不生成 data URL。面板或弹窗写入 DOM 后调用 `render.paintBackgroundPreviews(root)`：查找 `[data-preview-page]`，按 `clientWidth/clientHeight` 设置位图尺寸并绘制。

理由：
- 避免每次 `renderAll` 同步 `toDataURL` 编码。
- 同一 canvas 可在不重建 DOM 时重绘（例如后续接入拖拽实时刷新）。
- 弹窗与属性面板共用同一入口。

回退尺寸：canvas 尚未布局（`clientWidth` 为 0）时按 CSS 的 72x96 / 40x52 逻辑尺寸乘 DPR，保证首次可见。

### D3: 刷新时机沿用现有重渲染，不接入拖拽帧

属性改值、添加/替换/删除/排序、清空、页面尺寸变化都通过 `ui.renderAll`，自然重绘预览；画布拖动背景图在 `pointerup` 时触发 `ui.renderAll`。填充色取色器为保持焦点不重渲染面板，所以在 `setBackgroundColor` 里直接补画一次可见缩略图。因此不修改视口绘制循环，零常驻成本。

如果之后要逐帧预览，唯一挂钩点是 `viewport.scheduleRedraw` 的 rAF flush；`paintBackgroundPreviews` 已按 canvas 重绘设计，届时不需要改数据结构。本次不做。

### D4: 预览框等比容纳，取消 `cover`

`.bg-preview` 保留固定外框与边框，内部 canvas 宽高 100%；页面内容由 `k` 等比缩放并居中，空出的边是透明区域。`object-fit: cover` 与 `background-size: cover` 只用于历史首图方案，随 `<img>` 一起移除。

### D5: 删除页面级 actions 分区

`renderPageProperties` 去掉末尾 `propGroup('actions', …)` 与 `bind`（页面面板本来就没有绑定）。分类块面板的可用删除按钮保留。没有其它代码或回归用例引用 `#prop-delete-block` 的页面实例。

## Risks / Trade-offs

- [缩略图在图片资产尚未解码时缺图] → 正常路径（导入、恢复、添加、预置）都先解码再渲染；预览下一次 `renderAll` 自动补上，不额外做异步加载。
- [每次面板重渲染增加一次小画布合成] → 单页约 144x192 设备像素、1–5 张图；无背景图时只填色。必要时再按背景签名缓存，本次不加。
- [小尺寸效果位图进入共享 LRU] → 每条不足 0.1MP，上限 12MP，最坏挤掉一两张全尺寸缓存，重新烘焙即可。
- [页面尺寸拖拽时比例变化，缩略图在松手后才更新] → 符合“拖拽结束刷新”的规格；若需要逐帧，按 D3 的预留钩子接入。
- [移除页面级按钮后用户找不到删除入口] → 删除一直在选中对象的属性面板和 Delete 键；图层面板仍可选择对象。符合既有交互模型。

## Migration Plan

无数据迁移。纯前端渲染与面板结构调整，旧项目、旧草稿与导出的 PNG/JSON 不受影响。回滚即还原相关文件。

## Open Questions

无。预览显示本页背景已由用户确认；全局背景的文案与只读约束已经存在。
