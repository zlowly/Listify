# Design

## Context

当前编辑器是零构建的经典脚本应用：`model` 定义项目与背景，`render` 用 Canvas2D 绘制页面，`project-schema` / `project-io` 负责校验与读写，`app-*` 负责交互，`ui-*` 负责面板。项目格式为 v4，每页背景是 `{ color, images[] }`，图片列表有序、可拖拽换序，填充色固定在最底层。内容元素只有 `category`、`text`、`image`，其中 `image` 已具备八向缩放、旋转、任意角度命中、透明度、模糊、亮度、色相与渐隐。

本次要在这套结构上增加方形/菱形图形，并让图形同时存在于内容层和背景层。关键约束是：

- 图形与图片在背景中要能任意交错，因此背景不能继续用两个独立列表。
- 菱形角度由外接框宽高推导，不新增第三份尺寸数据。
- 图形命中必须贴合实际路径，菱形空白角、正圆角外侧与负圆角内凹缺口不能误选。
- 边框必须画在路径内侧，不能超出外接框。
- 现有零构建、`file://`、经典 `defer` 脚本、无网络依赖的约束不变。
- `js/model.js` 已 1166 行、`js/ui-property-panel.js` 已 1038 行，新增几何逻辑不应继续堆进这些文件。

## Goals / Non-Goals

### Goals

- 内容层新增 `type: 'shape'`，背景层新增 `kind: 'shape'` 条目，共用一套图形字段与几何实现。
- 背景统一为有序 `items[]`，图片与图形可任意交错，复制、清空、预置换整套、预览、全局只读和导出都覆盖 items。
- 提供拖拽绘制、单击插入默认尺寸、连续绘制的图形工具；工具栏入口固定内容层，背景卡片入口固定背景层。
- 图形支持方形/菱形、0–90° 内夹角、带符号圆角（正值外凸、负值内凹）、实心/边框、颜色、透明度、模糊、亮度、色相与渐隐。
- 项目格式升级到 v5，完整读取 v1–v4；草稿恢复上限同步到 5。
- 纯几何逻辑可在 Node 中测试，不依赖 DOM、Canvas 或 IndexedDB。

### Non-Goals

- 不增加椭圆、多边形、任意斜切或自由路径；本次只有 `rect` 与 `diamond`。
- 不做内容图形与背景图形之间的转换；换层需要删除后重画。
- 不做图形预设库、图形素材或图形模板。
- 不改变仅歌单层导出的语义：仍然只绘制分类块。
- 不把现有超限文件（`model.js`、`ui-property-panel.js`）的整体拆分作为本次目标；只避免新增逻辑继续加重超限。
- 不在本次引入图片/图形之外的运行时依赖或构建步骤。

## Decisions

### 1. 新增纯逻辑模块 `js/shape.js`

新增 `js/shape.js`，放在 `js/model.js` 之后、`js/playlist-check.js` / `js/layout.js` / `js/render.js` 之前。它只依赖 `L.model.uid` / `L.model.clamp` 这类通用工具，不访问 DOM、Canvas、存储或 `L.app`。

职责与 API：

| API | 作用 |
| --- | --- |
| `SHAPE_KINDS = ['rect', 'diamond']` | 形状枚举 |
| `SHAPE_MODES = ['fill', 'stroke']` | 填充方式枚举 |
| `DEFAULT_SHAPE` | 默认字段：`rect`、`fill`、`#333333`、`radius: 0`、`strokeWidth: 8`、`opacity: 1`、`blur: 0`、`brightness: 1`、`hue: 0`、渐隐关闭 |
| `createShapeElement(x, y, width, height)` | 生成内容图形，`type: 'shape'`，id 前缀 `shape` |
| `createBackgroundShape(x, y, width, height)` | 生成背景图形，`kind: 'shape'`，id 前缀 `bgshape` |
| `diamondAngle(width, height)` | 由宽高推导 0–90° 内夹角 |
| `diamondSizeFromAngle(width, height, angle)` | 保留长边，返回调整后的 `{ width, height }` |
| `shapeInradius(shape)` | 返回正圆角/边框厚度上限（内切圆半径） |
| `shapeConcaveLimit(shape)` | 返回负圆角上限（内凹缺口半径上限） |
| `clampShape(shape)` | 就地夹取尺寸、带符号圆角、边框厚度，返回同一对象 |
| `shapeOutline(shape)` | 返回局部坐标下的路径命令序列（直线 + 圆弧），供渲染层消费 |
| `shapeContains(shape, localX, localY)` | 局部坐标下的实际路径命中测试 |

路径命令使用纯数据描述，例如 `{ type: 'line', to: {x, y} }`、`{ type: 'arc', center, radius, startAngle, endAngle, anticlockwise }`，由 `render.js` 转成 Canvas 调用。这样 `shape.js` 本身不依赖 Canvas，Node 测试可以直接验证角度、内切圆、夹取与命中。

替代方案：

- 放进 `model.js`：会让已超限的文件继续膨胀，且几何与项目模型职责混杂。
- 放进 `render.js`：`project-schema` 无法复用校验所需的几何上限，Node 测试还要加载 Canvas 桩。

### 2. 数据模型与统一的背景 `items`

内容图形：

```js
{
  id: 'shape-…',
  type: 'shape',
  shape: 'rect' | 'diamond',
  x, y, width, height, rotation,
  mode: 'fill' | 'stroke',
  color: '#333333',
  radius: 0,
  strokeWidth: 8,
  opacity: 1,
  blur: 0,
  brightness: 1,
  hue: 0,
  fadeMode: 'off',
  fadeAngle: 0,
  fadePosition: 0,
  fadeWidth: 1,
  fadeTop: 0,
  fadeBottom: 1
}
```

背景条目：

```js
{ id: 'bgimg-…', kind: 'image', assetId, fit, x, y, width, height, rotation,
  keepRatio, opacity, blur, brightness, hue, fade* }

{ id: 'bgshape-…', kind: 'shape', shape, x, y, width, height, rotation,
  mode, color, radius, strokeWidth, opacity, blur, brightness, hue, fade* }
```

- 图形不保存 `assetId`、`fit`、`keepRatio`，也不保存 `angle`；角度始终由 `width` / `height` 推导。`radius` 为带符号值：0 为直角，正值为外凸圆角，负值为内凹圆弧。
- `createPageBackground(color)` 改为返回 `{ color, items: [] }`。
- `createBackgroundImage` 生成的图片条目带 `kind: 'image'`；`clonePageBackground` 按 `kind` 克隆：图片共享 `assetId`、生成新 `id`，图形深拷贝并生成新 `id`，顺序保持不变。
- 运行时不再读取 `background.images`。只有 v1–v4 的导入/迁移路径会接触旧 `images` 字段，进入内存前统一转成 items。
- 背景条目选择态统一为 `{ type: 'backgroundItem', itemId }`。保留 `selectBackgroundImage(id)` 作为兼容入口，内部委托给 `selectBackgroundItem`，并拒绝非图片条目；新增 `selectBackgroundShape(id)`。`selectedBackgroundItem` / `selectedBackgroundImage` / `selectedBackgroundShape` / `backgroundItemBounds` 作为统一辅助函数，避免各模块继续按“背景图片”写死。
- `backgroundItemBounds(item)` 对图片返回 `backgroundImageRect` 的结果，对图形返回 `{ x, y, width, height, rotation }`。选择框、属性面板、方向键和画布命中都通过它取几何。

替代方案：

- 保留 `images[]` 再增加 `shapes[]`：迁移最小，但图片与图形无法交错，且两套排序、复制、预览、只读逻辑会重复。
- 用两个列表加固定层级：只适合“图形只做装饰”的简单场景，不能满足本次“任意交错”的已确认需求。

### 3. 菱形角度

外接框宽高为 `w`、`h`，菱形顶点为四边中点。内夹角取锐角：

```text
θ = 2 × atan(min(w, h) / max(w, h)) × 180 / π
```

设置角度时保留长边：

```text
long  = max(w, h)
short = long × tan(θ / 2)
```

- `w >= h` 时调整 `h = short`，否则调整 `w = short`。
- `w === h` 按 `w >= h` 处理，保留宽、调整高。
- `θ = 90°` 时 `short = long`，得到正方形菱形。
- `θ = 0°` 时短边取 1 像素，避免零面积；角度字段显示由宽高重新推导并取整的值。
- 所有写入都经过 `clampShape`，因此短边变小时圆角、边框厚度会同步夹取。
- `setShapeAngle` 只改宽高，不写 `angle` 字段；属性面板显示 `Math.round(diamondAngle(width, height))`。

示例：`240×240` 设置 45° → `tan(22.5°) ≈ 0.4142`，高约 `99.4`；`240×240` 设置 90° → `240×240`；`240×120` 把高改为 120 后角度约 `53°`。

### 4. 圆角轮廓（正值外凸、负值内凹）

方形与菱形的基础轮廓都是凸多边形 `P`。圆角按符号分两种构造：

1. 取局部坐标，中心为原点，`x ∈ [-w/2, w/2]`、`y ∈ [-h/2, h/2]`。
2. 基础多边形 `P`：
   - `rect`：四角 `(-w/2,-h/2)`、`(w/2,-h/2)`、`(w/2,h/2)`、`(-w/2,h/2)`。
   - `diamond`：上、右、下、左四个中点。
3. 正圆角上限 `rMax`：
   - `rect`：`min(w, h) / 2`。
   - `diamond`：`w × h / (4 × sqrt((w/2)² + (h/2)²))`。
4. 负圆角上限 `cMax`：
   - `rect`：`min(w, h) / 2`。
   - `diamond`：`sqrt((w/2)² + (h/2)²) / 2`，即菱形边长的一半。
5. `radius = clamp(radius, -cMax, rMax)`；`strokeWidth = clamp(strokeWidth, 0, rMax)`。
6. `radius > 0` 时：
   - 对 `P` 的每条边按向内法线偏移 `r`，相邻偏移线求交，得到内偏移多边形 `P_r`。矩形等价于内缩矩形；菱形的半对角线为 `a' = a - r·s/b`、`b' = b - r·s/a`，其中 `a = w/2`、`b = h/2`、`s = sqrt(a² + b²)`。
   - 圆角路径 = `P_r ⊕ disk(r)`：沿 `P_r` 的边画直线，在每个 `P_r` 顶点处画半径 `r` 的圆弧；圆弧圆心是该内偏移顶点，切点是该顶点到相邻原边的垂足。
7. `radius < 0` 时：
   - 设 `q = |radius|`。对 `P` 的每个顶点 `V`，在两条相邻边上各取距 `V` 为 `q` 的点 `A`、`B`。
   - 以 `V` 为圆心、`q` 为半径，从 `A` 到 `B` 画位于 `P` 内部的短弧，形成向内凹的圆弧缺口；相邻角之间用直线连接对应的 `A` / `B` 点。
   - `q = cMax` 时，相邻凹弧会在同一条边的中点相接，形成尖点；路径仍按闭合路径处理。
8. `radius = 0` 时退化为 `P` 的直线路径。所有圆弧都取从起点到终点的短弧；正圆角弧的圆心在内偏移顶点，负圆角弧的圆心在原角点，方向保证弧位于路径内部。

`shapeOutline` 返回上述直线/圆弧命令；`shapeContains` 使用同一份几何：

- 先把点旋转到图形的局部坐标（绕中心反向旋转）。
- 外接框快速排除。
- `radius >= 0`：点在 `P_r` 内 → 命中；否则计算点到 `P_r` 各边的最短距离，`≤ r` → 命中。
- `radius < 0`：把 `shapeOutline` 的圆弧按固定步长扁平化为折线（相邻重复点去重），用射线法判断点是否在闭合轮廓内；内凹缺口位于轮廓外，不会命中。
- `radius = 0` 时退化为凸多边形内部判断。

因此菱形空白角、正圆角外侧的直角区域与负圆角的内凹缺口都不会命中。边框模式仍按整个图形区域命中，不要求点必须落在描边上，保证空心图形也容易选中。

替代方案：

- 矩形用 `roundRect`、菱形用 `arcTo` 近似：负圆角、边角切点与命中会不一致。
- 命中用外接框或仅按凸多边形判断：实现简单，但会误选菱形空白角与负圆角内凹缺口，违反规格。
- 只允许正圆角，负值用翻转或裁剪模拟：无法让路径、命中与边框共用同一份几何。

### 5. 实心、边框与效果渲染

在 `render.js` 增加 `drawShape(ctx, shape, options)`，局部坐标绘制、外层负责平移/旋转：

- `ctx.translate(x + width/2, y + height/2)`，`ctx.rotate(rotation)`，然后在 `-width/2, -height/2` 的局部坐标中绘制。
- 无模糊、无调色、无渐隐时走快速路径：
  - `fill`：设置 `fillStyle = color`，按 `shapeOutline` 填充。
  - `stroke`：先按路径 `clip()`，再用 `lineWidth = 2 × strokeWidth` 描边。裁剪后外侧一半被裁掉，可见厚度正好是 `strokeWidth`，且不超出外接框。
  - 只有透明度时直接设置 `globalAlpha`。
- 需要模糊、亮度、色相或渐隐时，创建外接框大小的离屏 canvas（按当前设备像素比），在离屏上绘制形状，应用 `ctx.filter = blur(...) brightness(...) hue-rotate(...)`，再用现有 `fillFadeMask` / `fadeProfile` 做 `destination-in` 渐隐，最后以 `globalAlpha = opacity` 合成回主画布。
- 离屏尺寸严格等于外接框，模糊和渐隐都被裁在外接框内，符合“模糊只在外接框内生效”的规格。
- 边框在离屏路径中同样先裁剪再描边，避免效果把描边扩到外侧。
- `clampShape` 保证 `radius` 位于 `[-shapeConcaveLimit, shapeInradius]`、`strokeWidth` 位于 `[0, shapeInradius]`；负圆角路径是非凸的，填充、裁剪与描边仍共用同一条实际轮廓，边框裁剪后可见厚度仍为 `strokeWidth`。`strokeWidth = 0` 时边框不可见但字段保留。

渲染接入点：

- `paintBackground`：填完 `background.color` 后按 `background.items` 顺序遍历；`kind === 'image'` 走现有背景图片路径，`kind === 'shape'` 调 `drawShape`。页面裁剪已在外层完成。
- `drawPage`：`page.elements` 分支增加 `type === 'shape'`；`includeElementTypes` 过滤逻辑同样适用于 shape。
- `paintBackgroundPreviews` 继续调用 `paintBackground`，因此缩略图自动包含图形，无需单独实现。
- 完整页导出复用 `drawPage`，自动包含内容图形与背景图形；仅歌单层导出仍通过 `includeBackground: false` 与 `includeElementTypes: ['category']` 排除图形。

暂不为图形增加专用缓存：无效果图形走快速路径；有效果图形在拖拽时重建离屏 canvas，作为可接受的初期代价。若实测卡顿，再按“图形字段 + 尺寸 + 设备像素比”做与图片类似的桶缓存。

替代方案：

- 用 `globalCompositeOperation` 做边框环：需要再构造内缩路径，圆角处容易出错；裁剪描边更直接。
- 直接在页面坐标中画图形并依赖页面裁剪：无法把模糊限制在外接框内。

### 6. 命中、选择与变换

- `render.hitTest`：内容 shape 先把点旋转到局部坐标，再调用 `shapeContains`（正圆角用凸路径距离判断，负圆角用扁平化轮廓 + 射线法）；image 继续用现有旋转矩形；text/category 继续用 AABB。
- `render.hitTestBackground`：仅 `canEditPageBackground` 时倒序遍历 `background.items`；image 用 `backgroundImageRect` + 旋转矩形，shape 用局部坐标 `shapeContains`。返回 `{ background, item, index, rect }`，调用方不再假设一定有 `image` 字段。
- 负圆角的内凹缺口位于实际轮廓之外，不命中；选择框仍是外接矩形 + 八个手柄 + 旋转手柄，因此缺口区域虽然可见为空白，不会被误选。
- `render.elementBounds`：shape 使用 `height`；`elementAabb` / `elementCorners` / `pageOverflow` 与 image 一致，旋转后按四角判断内容溢出。
- `app-chrome`：`imageHandlePoints`、`rotateHandlePoint` 只依赖 `width/height/rotation`，可直接复用于 shape。`handlePoints`、`drawSelection`、`handleAt` 把 `type === 'shape'` 与 `type === 'image'` 归为同一组；背景条目按 `kind` 决定是否画旋转选框、八个缩放手柄与旋转手柄。
- `app-interactions.selectedElementAt`：shape 用局部坐标命中；选中元素优先于背景。
- `app-interactions.resizeDrag`：shape 使用 `model.computeImageResize(start, handle, delta, false, 1)`，自由缩放、不锁等比。给 `computeImageResize` 增加可选 `minSize` 参数，默认仍是 `IMAGE_MIN_SIZE = 40`，图片调用不受影响。
- 背景 shape 的移动/缩放/旋转复用内容 shape 的几何；背景 image 继续走 `fit` / `keepRatio` / `ensureCustomBackgroundImage` 逻辑。方向键对背景图片和背景图形都生效：图片沿用“转 `none` 并烘焙矩形后移动”，图形直接移动 `x/y`。
- `Delete` / `Backspace`：内容元素沿用现有删除流程，文案按 `type` 识别“图形”；背景条目在背景可编辑时删除，图形使用确认文案，删除图片沿用现有资产释放逻辑。
- 背景 close 覆盖页：`hitTestBackground` 直接返回 `null`，因此不会出现选择框、手柄或旋转响应。

### 7. 图形工具状态机

新增会话级状态：

```js
state.shapeTool = {
  active: false,
  target: 'content' | 'background',
  pageId: null,
  preview: null // { x, y, width, height }，页面坐标
}
```

激活：

- 工具条按钮 `btn-add-shape` 只以内容层落点激活；激活后按钮 `aria-pressed="true"`，画布加 `cursor: crosshair`。
- 工具栏入口固定 `target = 'content'`，背景卡片入口固定 `target = 'background'`；不再根据当前选择推断落点。
- 页面背景卡片的“＋ 图形”入口直接以 `target = 'background'` 激活；被全局背景覆盖时该按钮不显示。
- 激活时用现有 toast 提示“拖动绘制图形，单击插入 240×240；Esc 退出（背景层/内容层）”。
- 同一入口再次点击退出；从另一个入口点击时直接切换到对应落点并保持激活。
- `target` 在激活后固定；切换页面、按 `Esc`、或通过图层/属性面板选中其它对象时退出。
- 若激活后当前页变为被全局覆盖，退出工具，避免向只读背景写入。
- 背景层激活时工具栏按钮不显示按下态，避免把内容层按钮误认为背景层入口。

指针流程：

- `onPointerDown` 在页面尺寸手柄、页边距手柄之后、内容/背景命中之前拦截；只在页面范围内开始绘制。
- 记录页面坐标起点，`beginPointer` 捕获指针，`state.shapeTool.preview` 设为起点零尺寸。
- `onPointerMove` 更新预览矩形，按 `x = min(startX, currentX)`、`width = abs(...)` 计算，允许拖出页面。
- `onPointerUp`：
  - 屏幕拖动距离小于阈值（约 6 CSS 像素）→ 按单击处理：默认 `240×240`，以点击点为中心，夹在页面内；页面小于 240 时取页面宽高。
  - 否则使用拖拽矩形，宽高至少 1 像素；允许越出页面，交给内容裁剪和溢出提示。
  - 只在实际创建时 `pushUndo('添加图形')`，然后追加到目标列表末尾：
    - `content` → `page.elements.push(createShapeElement(...))`。
    - `background` → 确保 `page.background` 存在，`page.background.items.push(createBackgroundShape(...))`。
  - 创建后保持工具激活、不自动选中新图形；清空预览并重绘。
- `onPointerCancel` / `Esc` 清空预览，不创建、不写撤销。
- 预览由 `app-chrome` 的 overlay 层绘制虚线矩形，不进入 `drawPage`，因此不会出现在任何导出中。

### 8. 背景 items 操作与预置

- `app-backgrounds.js` 中所有 `page.background.images` 改为 `page.background.items`；函数名保留 `moveBackgroundImage` / `deleteBackgroundImage` 作为图片专用入口，同时新增通用 `moveBackgroundItem` / `moveBackgroundItemTo` / `deleteBackgroundItem`。
- `releaseBackgroundAssets(previous, current)` 只收集 `current.items` 中 `kind === 'image'` 的 `assetId`；图形不参与资产释放。
- `copyBackgroundFromPage`：`clonePageBackground` 完整复制 items，图片共享资产、所有条目重新生成 id，图形深拷贝；一条撤销；成功后选中背景（不选中具体条目）。
- `clearPageBackground`：新建白底 `{ color, items: [] }`，图片与图形一起清空；释放旧图片资产；一条撤销。
- `replacePageBackground`：整套替换颜色与 items；释放旧图片资产；替换后优先选中第一张图片条目，没有图片则选中背景。
- 预置：
  - `addPresetImage` 追加 `kind: 'image'` 条目到 items 末尾；判断 fit 时只看图片条目数量：无图片条目用 `cover`，已有图片条目用 `original` 居中；只有图形时仍按“无图片条目”处理。
  - `applyPresetWhole` 构造 `{ color: 建议色, items: [] }` 后加入预置图片，调用 `replacePageBackground`，已有图形随整套替换清除；成功后选中应用图。
  - `applyPresetAdd` 追加图片条目并选中。
  - `applyPresetReplace` 只替换选中的图片条目，保留其 fit、矩形、效果与 items 中的位置。
- 被全局覆盖页的所有入口继续保持只读：不显示“＋图片”“＋图形”，不响应画布背景命中，不允许属性面板写字段。

### 9. UI 集成

**工具条**：`index.html` 在“添加图片”旁增加“添加图形”按钮，图标可用 `▢`，`title` / `aria-label` 为“添加内容图形”。`ui.init` 绑定点击，点击时调用 `L.app.toggleShapeTool('content')`；背景卡片调用 `L.app.toggleShapeTool('background')`。

**图层面板**：

- 内容行按 `page.elements` 倒序；shape 图标按 `shape` 字段显示 `▢`（方形）或 `◇`（菱形），名称“图形 · 方形 / 图形 · 菱形”，副标题“自由图形”。
- 背景组展开的 items 子行按 `background.items` 倒序；图片图标 `▧`，图形图标同上；图片副标题保留 fit 文案，图形副标题“背景图形”。
- 背景组标题徽标改为“图片 N · 图形 M”；空 items 时仍显示“图片 0 · 图形 0”，预览区另显示“无内容”。
- 拖拽状态 `layerDrag.kind` 改为 `'element' | 'bgItem'`；内容行用 `data-layer-id`，背景条目用 `data-bg-item`；`layerDropTargetId` 只允许同 kind，背景组行和全局来源行不是落点。背景条目内图片与图形可以互相换序；跨列表拒绝；拖回原位不产生撤销。
- 点击分派：内容 shape → `selectElement`；背景条目 → `selectBackgroundItem`；全局来源行 → 切换来源页并选中背景。

**属性面板**：

- `renderPropertyPanelBody` 增加分派：
  - `selection.type === 'element'` 且 `element.type === 'shape'` → `renderShapeProperties(element, { background: false })`。
  - `selection.type === 'backgroundItem'` 且 `item.kind === 'shape'` → `renderShapeProperties(item, { background: true, page })`。
  - `backgroundItem` 且 `kind === 'image'` → 现有 `renderBackgroundImageProperties`。
- `renderShapeProperties` 字段：
  - 信息：图形类型、背景时显示所属页与全局状态。
  - 形状选择：方形 / 菱形。
  - 菱形时显示内夹角 `0–90`、`step=1`，值为推导角度取整；方形时隐藏。
  - 填充方式：实心 / 边框；颜色；带符号圆角 `-shapeConcaveLimit..shapeInradius`（0 为直角，正值外凸，负值显示“内凹”提示）；边框厚度仅在边框模式显示，范围 `0..shapeInradius`。
  - 位置 X/Y、宽高、旋转、不透明度、模糊。
  - 高级效果复用 `imageEffectFields` / `bindImageEffectFields`，提供亮度、色相、渐隐参数。
  - 删除按钮；背景图形不提供“替换图片”，改为显示所属页/全局提示。
- `app.js` 增加意图方法：
  - `setShapeField(field, value)`：内容元素与背景条目分派；白名单 `shape, mode, color, radius, strokeWidth, x, y, width, height, rotation, opacity, blur, brightness, hue, fade*`；写入后 `clampShape`，背景条目走 `canEditPageBackground` 检查并重绘 `['bg','overlay']`。
  - `setShapeKind(kind)`、`setShapeAngle(angle)`：专用入口，内部改宽高并夹取。
  - `ELEMENT_FIELDS` 增加 `shape`、`mode`、`color`、`radius`、`strokeWidth`；`angle` 不进入字段表。
- 字段撤销沿用现有属性字段策略：由 `ui-fields` 在交互开始时记录，不在每个输入事件里重复 `pushUndo`。
- `ui.updateSelectionLabel` 增加背景条目与内容 shape 的“图形”标题；`deleteSelection` 的确认文案按 `type` / `kind` 识别“图形”。

**背景分组布局**：

- 整套入口（“选择背景 / 更换背景”）独占一行。
- 下方四个按钮“＋图片”“＋图形”“复制背景”“清空背景”使用两列等宽布局（`grid-template-columns: repeat(2, minmax(0, 1fr))`），300px 宽度下不折行、无孤行。
- “清空背景”在 items 为空时禁用。
- 全局背景开关保持独立行“全局背景 / 所有页使用此背景”。
- 标题徽标显示“图片 N · 图形 M”与“全局来源”；整套替换规则只放在 `?` 帮助提示中。

### 10. 持久化与迁移

- 在 `model.js` 增加 `PROJECT_VERSION = 5`，`createDefaultProject`、`serializeProjectStructure`、`buildProject` 输出、`validateProject` 上限、`draft-store` 恢复上限统一引用它，避免版本号分散。
- `validateProject`：
  - 接受版本 1–5；`> 5` 报“高于当前支持的版本 5”。
  - v5 的背景必须包含 `items`；v5 不再接受仅 `images` 的背景。
  - v5 每个 item 必须有 `kind: 'image' | 'shape'`；未知 kind 失败。
  - image 条目沿用现有背景图片校验（id 唯一、assetId、fit、`fit === 'none'` 时矩形、透明度、模糊、旋转、等比、效果）。
  - shape 条目校验几何为正、`shape` / `mode` 枚举、颜色字符串、圆角在 `-shapeConcaveLimit..shapeInradius` 内、边框厚度在 `0..shapeInradius` 内、效果范围与图片一致；不要求 `assetId`。序列化与往返保留 `radius` 的符号。
  - 内容元素类型允许 `category | text | image | shape`；shape 元素校验同上。
  - v1–v4 继续走原有版本分支，但最终构建结果都是 v5 items。
- `project-io.js`：
  - `collectReferencedAssetIds` 只收集 `kind === 'image'` 的背景条目与 `type === 'image'` 的内容元素。
  - 新增 `serializeBackgroundItem(item)`：image 条目写现有字段，shape 条目写图形字段；两者都带 `kind`。
  - `serializePageBackground` 写 `{ color, items }`，不再写 `images`。
  - `serializeElement` 增加 shape 分支，写 `type: 'shape'` 与全部图形字段，不写 `assetId` / `keepRatio`。
  - `serializeProjectStructure` 写 `version: 5`。
  - `buildProject` 输出 v5。v5 直接读 `background.items`；v1–v4 继续用现有 `resolvePageBackgrounds` 解析每页背景，然后在边界处把旧 `images` 按顺序映射为 `{ kind: 'image', ... }`。迁移只发生在加载时，运行时只认 items。
- `project-schema.js`：
  - 新增 `buildBackgroundItem(rawItem, version)`：v5 按 `kind` 分派；v1–v4 一律按 image 处理。
  - `buildPageBackground` 优先读 `items`，旧格式读 `images` 并转 items；`legacyPageBackground` 直接生成 items。
  - `resolvePageBackgrounds` 返回 `{ globalBackgroundPageId, backgrounds }`，其中每个 background 都是 `{ color, items }`。
- `draft-store.js`：
  - 恢复草稿时用 `PROJECT_VERSION` 判断，`> 5` 返回 `reason: 'version'`。
  - `pruneMissingAssets` 只检查 `kind === 'image'` 的背景条目与 image 元素；图形不参与。
  - 草稿仍保存结构化项目，不额外序列化；旧草稿经 `buildProject` 迁移到 v5。
- `app.js` 的 `assetIsReferenced` 改为检查 items 中 `kind === 'image'` 与 image 元素；图形不影响资产释放。
- v5 是破坏性格式：旧版应用不能读 v5，新版必须完整读 v1–v4。README / PRODUCT / DESIGN / 需求文档同步说明。

### 11. 导出

- `export.js` 继续复用 `drawPage`：
  - 完整页：`includeBackground: true`、`includeElementTypes: null`，因此背景 items 中的图片/图形与内容 shape 全部绘制。
  - 仅歌单层：`includeBackground: false`、`includeElementTypes: ['category']`，因此背景层整体跳过，内容 shape 也被过滤。
- 图形工具拖拽预览只存在于 overlay，不属于 `drawPage`，不会进入导出。
- `waitForAssets` / `preloadPages` 仍只加载 `render.pageAssets` 的图片资产；图形没有资产，不需要预加载。

### 12. 测试与验收

**Node 纯逻辑测试**（`node --test scripts/checks/*.test.js`）：

- `shape.test.js`：
  - `diamondAngle(240, 240) === 90`；`diamondAngle(240, 120) ≈ 53.13`。
  - `diamondSizeFromAngle(240, 240, 45)` → `{ width: 240, height: 99.4… }`；`90` → 正方形；`0` → 短边 1。
  - 长边保留：`w < h` 时改宽，`w >= h` 时改高。
  - `shapeInradius` 与 `shapeConcaveLimit` 的矩形/菱形公式；`clampShape` 对带符号圆角、边框厚度的夹取（正负上限与尺寸变化）。
  - `shapeOutline`：正圆角产生内偏移圆弧；负圆角产生以原角点为圆心的内凹圆弧；`r = 0` 退化为直线；负值达到上限时相邻弧在边中点相接。
  - `shapeContains`：菱形中心命中、外接框空白角不命中、正圆角外侧不命中、负圆角内凹缺口不命中；旋转由调用方处理，测试局部坐标即可。
  - 默认值与 `createShapeElement` / `createBackgroundShape` 的 `type` / `kind` / id 前缀；确认没有 `assetId`。
- `io.test.js` / `model.test.js` 扩展：
  - v5 往返保持 items 顺序、图片定位/效果、图形形状/角度推导、带符号圆角（含负值内凹）/边框/颜色/效果。
  - v4 fixture 的 `background.images` 按顺序迁移为 `kind: 'image'` 的 items。
  - v5 只写 items，不写 images；`collectReferencedAssetIds` 忽略图形。
  - `validateProject` 拒绝 v6、未知 item kind、非法 shape 枚举、圆角超出正/负上限、边框厚度超出内切圆上限、仅 images 的 v5 背景。
  - `pageAssets` / `allBackgroundAssets` 只包含图片资产。
- 现有 layout / import / zip / draft-encoding 测试保持通过。

**浏览器手动验证**（`agent-browser`）：

- 内容层：拖拽画方形、单击插入 240×240、连续绘制、Esc / 再点按钮 / 切页退出；撤销每次只移除一个。
- 背景层：页面背景卡片“＋图形”强制背景；被全局覆盖页只能从工具栏画到内容层；选中背景图后使用工具栏仍写入内容层。
- 菱形：切换形状、输入 0 / 45 / 90、改宽高后角度自动更新、正/负圆角与边框厚度自动夹取。
- 命中：点击菱形空白角、正圆角外侧、负圆角内凹缺口不选中；点击空心边框内部可以选中。
- 图层：图片/图形混排、计数、拖拽换序、跨列表拒绝、方向键微调、删除确认。
- 背景操作：复制背景包含图形、清空背景清除图形、预置整套替换清除图形、可撤销。
- 导出：完整页包含内容/背景图形及效果；仅歌单层不包含图形；拖拽预览不出现在导出。
- v1–v4 项目文件导入后背景按原顺序显示；v5 导出重新导入保持一致。

**文档**：

- `docs/歌单生成器需求.md` 增加“图形”章节，更新背景章节为 items，补充菱形角度、圆角、边框、效果、图形工具与两种落点。
- `README.md` / `PRODUCT.md` / `DESIGN.md` 同步项目版本 5 与图形能力。
- `scripts/README.md` 的脚本角色说明补充 `js/shape.js`。

## Risks / Trade-offs

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 有效果图形的离屏 canvas 性能 | 拖拽带模糊/渐隐的图形时可能掉帧 | 先走无效果快速路径；实测后按需增加与图片类似的桶缓存和拖拽冻结 |
| 背景选择态从 `backgroundImage` 改为 `backgroundItem` | 触及 app / chrome / interactions / ui / property panel，容易漏改 | 保留 `selectBackgroundImage` 兼容入口；用 `selectedBackgroundItem` / `backgroundItemBounds` 收敛分支；逐项替换并手动回归 |
| v5 是破坏性格式 | 旧版应用无法读取新文件 | 新版完整读取 v1–v4；文档明确版本；导出测试覆盖 v4→v5 和 v5 往返 |
| 菱形角度取整与连续几何不一致 | 0° 附近可能显示 0 但短边为 1px | 按规格接受；显示值始终由宽高重新推导，不存 angle |
| 正圆角/边框同时接近内切圆上限 | 边框可能覆盖大部分图形 | 几何仍合法；`clampShape` 保证不超过内切圆；属性面板显示夹取后的值 |
| 负圆角达到上限形成尖点 | 相邻凹弧在边中点相接，扁平化轮廓出现重复点 | 允许到上限；`shapeOutline` 扁平化时去重相邻点，射线法仍按闭合轮廓判断 |
| 负圆角使轮廓非凸 | 外接框或凸多边形命中会误选内凹缺口 | `shapeContains` 对负值使用扁平化轮廓 + 射线法；边框仍裁剪到实际路径 |
| 命中测试与边框模式 | 空心图形点击内部也会选中 | 这是有意的选择体验：命中按完整路径区域，不按描边细线 |
| 现有 `model.js` / `ui-property-panel.js` 超 900 行 | 与 code-architecture 的行数约束不一致 | 新逻辑集中到 `shape.js`；不把旧文件拆分作为本次目标，避免扩大改动面 |

## Migration Plan

1. **纯几何层**：新增 `js/shape.js` 与 `shape.test.js`，在 `index.html` 中插到 `model.js` 之后；先让角度、内切圆/负圆角上限、带符号夹取、路径与命中测试通过。
2. **数据层**：`model.js` 引入 `PROJECT_VERSION = 5`、`createPageBackground` 返回 items、图片条目带 kind、`clonePageBackground` 按 kind 克隆；更新所有创建页/背景的调用点。
3. **持久化**：`project-schema` 支持 v5 items 与 shape 校验；`project-io` 增加 shape 序列化、items 序列化、v4 images→items 迁移；`draft-store` 上限改为 5；先让 Node 往返/迁移测试通过。
4. **渲染与命中**：`render.js` 增加 `drawShape`、items 遍历、shape 命中、资产过滤；`paintBackgroundPreviews` 自动复用；确认完整页导出包含图形。
5. **背景操作**：`app-backgrounds` / `app-presets` 全部迁移到 items；复制、清空、整套替换、加图/替换、资产释放覆盖 shape；补背景选择态。
6. **交互与 chrome**：选择/移动/缩放/旋转/方向键/删除支持 shape；背景条目统一选择；增加图形工具状态机与虚线预览。
7. **UI**：工具条按钮、图层面板混排与计数、属性面板 `renderShapeProperties`、背景分组布局与“＋图形”入口。
8. **收尾**：更新需求文档与 README / PRODUCT / DESIGN；跑完整 Node 测试；用 `agent-browser` 按验收清单逐项验证；最后执行 `openspec validate`。

每个阶段保持现有测试通过；数据层与渲染层切换完成前不发布，避免出现“能写 v5 但不能画/读”的中间状态。

## Open Questions

没有阻塞实现的未决问题。以下两项可延后调优，不改变规格或任务分解：

- 有效果图形的离屏缓存阈值与缓存键，先按简单实现实测，再决定是否增加缓存。
- 未来是否扩展椭圆、多边形等更多形状；本次明确只做方形与菱形。
