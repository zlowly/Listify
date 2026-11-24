# Design

## Context

本变更落在现有零构建结构里：`index.html` 用经典 `<script defer>` 声明顺序，纯逻辑模块可被 `scripts/checks/loader.js` 在 Node 中装载。拖拽只有一条管线：

```
pointerdown -> surface.drag = {...}
pointermove -> 按 drag.type 设置元素坐标 / 宽度 / 列宽
pointerup   -> 取整、清空 drag、renderAll
```

分类块的高度由 `layout.layoutCategory` 实时算出，画布上只能改 `x/y/width`；列宽由 `render.tableDividers` 提供边界，`layout.setManualWidths` 写回。现有唯一吸附是 `model.snapAngle` 的 15° 旋转吸附，与本次几何吸附无关。行为约束见 `specs/`，动机见 `proposal.md`。

## Goals / Non-Goals

**Goals:**

- 一个不依赖 DOM 的纯吸附核心，覆盖阈值、最近目标、同距优先级、释放余量和列宽合法性，可在 `node --test` 中回归。
- 三个适配点：分类块移动、分类块左/右改宽、列分隔线拖动；参考线只进 overlay。
- 拖拽开始时快照候选，拖拽中只做纯计算，避免每帧重排整页。

**Non-Goals:**

- 不增加表格边缘拖动、表体拖动或子分区独立几何；这些仍属于后续变更。
- 不把吸附扩展到自由文字、图片、图形、页面尺寸或页边距拖动。
- 不做网格、等间距、等宽、触屏替代修饰键或吸附开关设置。
- 不修改项目 JSON、IndexedDB 草稿、导出画布或布局结果。

## Decisions

### 1. 新增纯模块 `js/snap.js`（`L.snap`），而不是塞进 model 或 interactions

`js/snap.js` 只做数值比较和列宽换算，不引用 DOM、canvas、layout、render。加载顺序放在 `model.js` 之后、`layout.js` 之前；`scripts/checks/loader.js` 会自动从 `index.html` 读到它，因此测试无需额外桩。

```js
L.snap = {
  SCREEN_THRESHOLD: 6,
  RELEASE_SCREEN: 2,
  pageThreshold(scale),          // 屏幕像素 -> 页面坐标
  choose(options),               // 纯选择：最近/同距/去重/保持
  widthFromEdge(options),        // 块边或表格边 -> 块宽
  applyDividerDelta(options)     // 列宽增减 + 最小宽度校验
};
```

备选方案：写进 `model.js`（该文件已 1300+ 行，且 model 不包含交互概念）；写进 `app-interactions.js`（无法进入现有 Node 回归，且 app 工厂依赖 canvas/DOM）。拆成独立脚本最贴合现有“纯逻辑可装载”的边界，也不会引入构建步骤。

`choose` 的输入输出保持数据化，便于单测：

```js
choose({
  anchor,        // 本次可动的线：{ value, kind, tableIndex? }
  targets,       // [{ value, priority, span, kind, ... }]
  threshold,     // 页面坐标
  release,       // 页面坐标
  hold,          // 上一次吸附结果，可为 null
  isValid        // (anchor, target) => boolean，可选
})
// -> { anchor, target, delta } | null
```

规则：

- 目标先按 `value` 去重，保留优先级更高的一条。
- 候选距离 `|target.value - anchor.value|` 必须不大于阈值；`isValid` 拒绝的目标跳过。
- 最近者胜；同距比较 `priority`（页面内容区边缘/中心 > 块外框/中心 > 表格内边 > 列分隔线）；仍相同则保留先出现的目标。
- `hold` 存在且目标仍合法、当前原始线距该目标不超过 `threshold + release` 时，直接保持，不重新选最近者。这样参考线不会在阈值边界抖动。
- 返回值里的 `delta` 由调用方加到原始坐标上；`choose` 不写模型。

### 2. 候选在 pointerdown 时快照，pointermove 只做纯计算

在 `app-interactions.js` 增加一个只读的 `buildSnapContext(page, dragged)`：

- 页面内容区：`margins.left/right/top/bottom`；页面中心：`pageSize.width/2`、`pageSize.height/2`。
- 其它分类块：`renderer.elementBounds(project, page, element)` 给外框和中心。
- 其它分类块内缩的表格：`layout.layoutCategory(category, element, { editMode: true })` 给 `tables[].x / tableWidth / y / height`，换算到页面坐标；只有当表格边与所属块的对应边相差超过 0.5px 时才加入，避免零边距默认布局产生重复候选。
- 列分隔线目标：`renderer.tableDividers(project, page, element)`，含同块其它表和其它块的表；排除正在拖的那一条（按元素 id、`tableIndex`、`dividerIndex` 匹配）。
- 每个目标带 `span`（参考线跨度）和 `kind/priority`；同一坐标去重。

快照在 `surface.drag.snap` 中保存 `threshold / release / targets.x / targets.y`。拖拽期间页面尺寸、边距和其它元素都不会被本手势修改，所以不需要重算；这比每帧遍历整页更稳定，也避免参考线随无关布局变化跳动。

### 3. 三个适配点共用同一套“原始值 -> 吸附 -> 落值”流程

**分类块移动**

- 原始 `x = startX + dx`、`y = startY + dy`。
- 水平锚点：块左/中/右，以及有内缩的表格左/右边；垂直锚点：块上/中/下。
- 每个轴调用一次 `choose`，把 `delta` 加到原始坐标，再交给现有取整逻辑。
- 高度仍是 `layoutCategory` 的结果，不参与锚点。

**分类块改宽**

- 只用被拖动一侧：
  - `e` 手柄：块右边 + 每张有内缩表格的右边；原始边 `start.x + start.width + dx`。
  - `w` 手柄：块左边 + 每张有内缩表格的左边；原始边 `start.x + dx`，右边固定为 `start.x + start.width`。
- 选中目标后由 `snap.widthFromEdge` 统一换算：

```
e + 块右边:     width = target - element.x
e + 表格右边:   width = target - element.x + table.margins.right
w + 块左边:     width = right - target
w + 表格左边:   width = right - target + table.margins.left
```

- 换算结果仍先经过现有 `clamp(80, pageWidth * 3)`；`isValid` 用同一范围过滤目标，避免吸到不可达的宽度。
- 表格因 `MIN_TABLE_WIDTH` 或 `table.x` 的 clamp 已经退化时，不把它的边加入改宽锚点：此时表格边与块边不再满足简单的“宽度减边距”关系，公式不可逆。移动和列分隔线仍可使用它的实际布局坐标。
- 之后照旧调用 `layout.scaleManualWidths(element, element.width / oldWidth)`。这意味着宽度吸附会让手动列宽按比例跟随，和当前拖动手柄的语义一致。

**列分隔线**

- 原始边界 `startBoundary + dx`（`startBoundary` 由 `startWidths` 前缀和加 `element.x + table.x` 得到）。
- 只用一个水平锚点；目标为其它列分隔线和页面内容区左右边。
- 选中目标后 `delta = target - rawBoundary`，交给 `snap.applyDividerDelta`：把 `delta` 加到左列、从右列减掉；任一侧低于 `MIN_COL_WIDTH` 时返回 `null`。
- `null` 时回退到无吸附的原始 `dx`，不冻结拖动。原始 `dx` 本身已使某侧低于最小列宽时，保留现有“本次 move 不生效”的行为。
- 只改相邻两列，表格总宽、列数、填充方式、对齐和边距都不变。

### 4. 参考线数据只存在 `surface.snapGuides`，由 overlay 绘制

`pointermove` 每次覆盖 `surface.snapGuides`（没有吸附时为 `[]`），`pointerup` 在清空 `surface.drag` 时一并清空。app-chrome 在 `drawOverlayLayer` 里、`drawSelection` 之后调用 `drawSnapGuides`：

- 页面坐标转屏幕坐标复用 `viewport.offsetX/offsetY/scale`，与选择框、手柄、表格分隔线同一变换。
- 实线 `rgba(37, 99, 235, 0.9)`、1px；两端各 5 屏幕像素短刻度。与页边距的 48% 透明 5/5 虚线明确区分。
- 跨度取“被移动元素包围盒”和“目标 span”的并集，并裁剪到页面矩形；页面内容区边缘的 span 取整页高度/宽度。
- 表格内边作为锚点时，在被吸的表格边与参考线交点画一段 6px 的短刻度，提示是哪张表在吸；不加文字标签。
- 只在 overlay 层出现，内容层 canvas 和导出路径完全不知道它的存在。

备选方案：画在 chrome 层。chrome 层已负责页边距和溢出提示，但对齐线需要覆盖选择框和表格分隔线之上，overlay 层的绘制顺序更合适；两层的坐标系相同，成本没有区别。

### 5. 阈值、取整与修饰键

- 阈值固定为 6 屏幕像素，释放余量 2 屏幕像素。拖拽开始时用 `6 / viewport.scale`、`2 / viewport.scale` 一次性换算；拖拽中缩放不发生变化，不需要每帧换算。
- 吸附时使用目标原始坐标（可能来自表格边距的小数）；现有 pointerup 的 `Math.round` 继续负责最终取整，最多产生亚像素偏差，参考线在松手时已经清除，不会出现“线还在但元素偏 1px”的画面。
- `event.altKey` 在 pointermove 上读取：为真时跳过 `choose`、清空参考线，直接使用原始值。拖拽期间同时监听 Alt 的 keydown/keyup，用最后一次指针位置重放当前手势的吸附计算，因此按住或松开 Alt 时即使指针没有移动，吸附和参考线也会立即切换。重放是安全的：move 从 `startX/startY` 计算，divider 从 `startWidths` 计算，width 的列宽缩放是从当前宽度过渡到目标宽度，不会把增量重复叠加。
- 方向键微调不经过拖拽管线，保持 1px/Shift 10px，不吸附。

### 6. 撤销、渲染与测试边界

- 拖拽开始处原有的 `pushUndo` 不变；吸附只改变同一手势内的坐标，因此仍然一条撤销记录。
- 吸附不调用 `layout.invalidate` 之外的新失效；移动/改宽/列宽仍按现有 `scheduleRedraw(['content','overlay'])` 合帧。
- `js/snap.js` 进入 `index.html` 后，loader 自动装载；新增 `scripts/checks/snap.test.js` 覆盖：
  - 阈值内/外、缩放换算、最近目标、同距优先级、同坐标去重；
  - `hold` 在 `threshold + release` 内保持、超出后释放；
  - `isValid` 过滤不可达宽度；
  - `widthFromEdge` 四个分支；
  - `applyDividerDelta` 的左右列最小宽度保护与总宽不变。
- 候选收集依赖 `layoutCategory` 和 `render.tableDividers`，属于画布几何，不放进 Node 用例；用浏览器手测覆盖跨块表格边、跨块列线、200% 缩放、Alt、撤销和导出。

## Risks / Trade-offs

- **已对齐位置起步会“粘住”**：这是磁吸的固有行为，靠 Alt 和 `threshold + release` 控制 → 保持 6px 阈值并在帮助文案/手测中确认手感；不额外增加“起步不吸”状态。
- **块内表格边增加候选密度**：多个表格边可能同时进入阈值 → 只收内缩超过 0.5px 的边、每个轴最多一条、最近优先，并画锚点标记。
- **宽度吸附与手动列宽缩放叠加会跳变**：现有 `scaleManualWidths` 按比例缩放 → 保持原语义，手测确认不会出现负宽或列宽塌缩；不改变列宽存储格式。
- **列分隔线目标可能不可达**：吸附目标可能要求某列低于 24px → `applyDividerDelta` 返回 `null` 并回退自由拖动，不阻断手势。
- **触摸设备没有 Alt**：默认吸附在触摸上无法临时关闭 → 本项目以桌面指针为主，先接受，后续可加设置开关（不属于本变更）。
- **跨块候选依赖其它块的布局快照**：页面元素多时收集成本上升 → 只在 pointerdown 做一次，排除被拖元素，使用现有布局缓存；单页元素规模远小于性能敏感阈值。
- **参考线与页边距线都用蓝色**：可能混淆 → 用实线 + 端点短刻度，页边距保持 48% 虚线；导出不包含任何编辑辅助。

## Migration Plan

无数据迁移。回滚只需移除 `js/snap.js` 的 `<script>`、三个手势里的吸附分支和 overlay 绘制；项目 JSON、草稿和导出文件不受影响。
