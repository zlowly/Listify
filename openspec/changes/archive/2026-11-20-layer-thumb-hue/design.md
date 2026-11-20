# Design

## Context

- 图层面板图片行缩略图由 `js/ui.js` 的 `layerThumb(assetId)` 拼装：直接取资产的 object URL 生成 `<img class="layer-thumb">`，不带任何效果；两个调用点是内容图片行（传入 `element`）与背景图片子行（传入 `item`），两处调用方手里都有完整条目对象。
- 画布侧的图片效果在 `js/render.js` 归一化：`finiteOr(value, fallback)` 把缺失/非法值收敛为默认，`filterString(effects, blurScale)` 拼 CSS 滤镜串，其中色相项为 `hue-rotate(Ndeg)`，仅在非 0 时出现。
- 内容图片元素与背景图片条目都带 `hue` 属性（model 默认 0，project-schema 校验范围 -180–180，缺失按 0 处理）。
- 依赖方向允许 `ui` 依赖 `render`（`index.html` 中 render 在前）；Node 回归装载器已加载 `js/render.js`，其内部纯函数可以直接断言。
- 现有主 spec「图片行显示资产缩略图」要求缩略图不烘焙任何效果，本变更把它收窄为"只反映色相"（见 delta）。

## Goals / Non-Goals

**Goals:**

- 色相为非零有限值的图片行（内容与背景）缩略图与画布观感一致。
- 缩略图与画布共用同一份色相归一化与滤镜串格式，单点维护。
- 色相为 0、缺失或非法（旧项目）时缩略图外观与改动前逐像素一致。
- 新增的纯逻辑助手可被 Node 回归套件直接覆盖。

**Non-Goals:**

- 不把亮度、模糊、裁剪、渐隐、透明度烘焙进缩略图（保留原需求其余约束）。
- 不改图形行迷你图形、缩略图缺失回退、行结构、焦点与无障碍名称。
- 不新增任何持久化数据或项目字段。

## Decisions

1. **在 `render.js` 新增并导出助手 `L.render.hueFilter(item)`**：用既有 `finiteOr(item.hue, 0)` 归一化，非 0 返回 `hue-rotate(Ndeg)`，否则返回空串。
   - 为什么放 `render.js` 而不是 `ui.js`：色相的归一化与滤镜串格式语义已经住在 `render.js`（`imageEffects` / `filterString`），助手与它们同源，`ui.js` 只消费结果，避免两处各自写 `Number(…)` 判断与 `deg` 格式造成漂移。
   - 为什么不直接复用 `imageEffects` + `filterString`：`filterString` 需要 `blurScale` 且会混入本次不要的 blur/brightness 项，专门的小助手边界更干净。
   - 备选（弃）：`ui.js` 内联 `Number(item.hue)` 判断后拼 style——归一化逻辑重复，画布改归一化时缩略图容易漏改。
2. **`layerThumb(assetId)` 扩参为 `layerThumb(assetId, item)`**：助手返回非空时在 `<img>` 上加 `style="filter:hue-rotate(Ndeg)"`；两个调用点把现成的 `element` / `item` 透传。`<img>` 上的 CSS `hue-rotate` 与 canvas 滤镜语义相同，观感一致。
   - 备选（弃）：用 canvas 烘焙缩略图或包一层带 filter 的容器——缩略图是 20px 级小图标，CSS filter 足够且零额外位图；包容器会改变行内 DOM 结构与既有选择器。
3. **刷新链路：色相输入绑定补一次图层行重建**：属性意图方法（`setElementField` / `setBackgroundImageValue`）写入后只按 `property: false` 重绘画布或 `scheduleRedraw`，并不会重建图层行；所以 `ui-property-panel.js` 的 `bindImageEffectFields` 在色相 `input` 绑定里于 `write('hue', …)` 之后直接调用 `ui.renderLayerPanel()`。内容图片与背景图片共用这一处绑定，两条路径一次覆盖；不新增监听或增量 DOM 更新。
   - 为什么不在 `changed()` 里统一重建：亮度、位置等滑块每帧输入都会重排图层列表，代价与收益不成比例。

## Risks / Trade-offs

- [CSS `hue-rotate` 与 canvas `hue-rotate` 语义相同，但极端配色下浏览器 CSS 滤镜与 canvas 滤镜实现可能存在细微色差] → 缩略图只承担身份辨认，画布与导出才是视觉基准，可接受。
- [每条带滤镜的缩略图多一段 style 解析] → 图层行数有限（一页元素数），开销可忽略。
- [`<img>` 增加 `style` 属性影响既有检查] → `dev-checks.js` 的图层行检查只断言 `src` 与回退字形，不受影响；Node 套件对 `render.js` 仅新增断言。

## Migration Plan

- 无数据迁移：hue 字段本就存在，旧项目缺失字段走"显示原图"分支，外观不变。
- 回滚：直接还原代码即可，无持久化数据、无 schema 变更。

## Open Questions

- 无。范围"只反映色相"是用户的明确请求；亮度/模糊等其余效果若以后想进缩略图，另起变更处理。
