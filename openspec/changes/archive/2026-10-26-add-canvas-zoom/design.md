# Design

## Context

画布当前是 `.canvas-pane`（`position: relative; overflow: hidden`）内的三层：绝对定位的 `#canvas-toolbar`（z-index 6）、`#leafer-view`（z-index 1，承载 LeaferJS 的页面位图）和铺满整个 pane 的 `#overlay`（z-index 3，绘制阴影、参考线、选择框并接收全部指针事件）。`js/app.js` 的 `computeViewport()` 在每次 `redraw()` 时根据 pane 矩形重新计算适配比例（0.05–1.6）、`padding`（24–72px）和居中偏移；`translate(offsetX, offsetY) scale(scale)` 只作用于 `#leafer-view`，overlay 绘制与 `toPage()` 都使用同一组屏幕坐标。`ui.js` 只在窗口 `resize` 时调用 `app.fit()`。

因此有三个直接约束：

- 缩放不能只是把 `viewport.scale` 改大：`redraw()` 会在下一帧重新适配并覆盖用户比例，必须把“适配比例”和“当前比例”拆开。
- overlay 必须保持固定并接收指针事件，不能跟着页面内容滚动；滚动条又必须是原生、可拖动的，所以滚动容器与 overlay 必须是兄弟节点而不是父子。
- 项目数据里没有视图状态，保存/加载格式（`io.serializeProject`）不包含缩放；缩放属于会话级 UI 状态。

零构建、经典 `<script>`、`file://`、仅 vendored LeaferJS、无网络这些约束不变。动机见 `proposal.md`，行为契约见 `specs/canvas-view/spec.md`。

## Goals / Non-Goals

**Goals:**

- 在现有画布工具条内提供缩放控件，默认“适应窗口”，支持 10%–400% 固定比例。
- 用原生滚动条解决超出可视区的观看问题，同时保证工具条固定、overlay 坐标与滚动一致。
- 把视图缩放限制在视图层：数据模型、项目 JSON、排版、PNG 导出零改动。
- 复用现有 `viewport`/`computeViewport`/`toPage` 结构，避免引入第二套坐标系统。

**Non-Goals:**

- 不做画布拖拽平移（space+drag / 中键拖拽）、触屏双指缩放、缩放动画或缩放记忆到项目。
- 不改变页面尺寸、边距、元素编辑和导出的既有语义；不新增整行工具栏。
- 不为缩放做高分辨率重渲染（见 Risks 中的画质取舍）。

## Decisions

### 1. 滚动容器与 overlay 分层：滚动发生在一个内层，overlay 留在可视层

DOM 调整为：

```html
<main id="canvas-pane" class="canvas-pane">
  <div id="canvas-toolbar" class="canvas-toolbar">… + 缩放组</div>
  <div id="canvas-scroll" class="canvas-scroll">
    <div id="canvas-stage" class="canvas-stage">
      <div id="leafer-view" class="leafer-view"></div>
    </div>
  </div>
  <canvas id="overlay" class="overlay"></canvas>
  <div id="empty-hint" class="empty-hint">…</div>
</main>
```

- `#canvas-scroll`：`position: absolute; inset: 0; overflow: auto;`，唯一滚动容器。`#canvas-stage` 的尺寸由 JS 设为“页面缩放后尺寸 + 内边距”，超出时浏览器自然给出横向/纵向滚动条。
- `#overlay` 仍绝对定位在 pane 左上角，但 CSS 宽高改为 JS 设置的 `#canvas-scroll.clientWidth / clientHeight`（不含滚动条），因此不会被滚动带走，也不会盖住滚动条。指针事件仍全部由 overlay 接收。
- 工具条与空态提示保持在 pane 内、滚动容器之外，天然固定；工具条 z-index 最高，空态 `pointer-events: none` 不变。
- 备选方案一：让 `.canvas-pane` 自己滚动，overlay 作为其子节点——overlay 会一起滚动且滚动条被覆盖，否决。
- 备选方案二：不放原生滚动条，用自定义 offset + 拖拽/滚轮平移——用户明确要求“有竖向或横向滚动条”，且原生滚动条自带拖动、轨道点击和触控板行为，否决。

### 2. 比例状态：`mode: 'fit' | 'manual'` 加一个固定比例

`viewport` 增加：

```js
mode: 'fit',       // 'fit' | 'manual'
zoom: 1,           // manual 模式下的比例
fitScale: 1,       // 每次布局重新计算的适配比例
scrollX: 0, scrollY: 0,
clientWidth: 0, clientHeight: 0
```

- `computeViewport()` 只负责测量（`#canvas-scroll` 的 client 尺寸、工具条高度）并计算 `fitScale`、`padding`、`stage` 尺寸，不再直接决定 `scale`。
- 有效比例：`mode === 'fit' ? fitScale : zoom`。所有绘制、命中、拖拽换算继续读同一个 `viewport.scale`，坐标系统不分叉。
- 进入 manual 的入口：点击 ±、提交百分比、`Ctrl`/`⌘` + 滚轮。任何 manual 入口都把结果限制在 `[0.10, 4.00]` 并取整到 1% 精度显示；从 fit 进入时以当前 `fitScale` 为起点（若低于 10% 则先抬到 10%）。
- “适应窗口”把 `mode` 设回 `fit`，比例交给 `fitScale`；窗口 resize 时只有 fit 模式会重新适配，manual 保持比例。
- 页面尺寸变化（属性面板改宽高）只触发重绘，不重置 manual 比例。
- 比例是会话状态，不写入 `state.project`，不进入 `io.serializeProject`。

### 3. 几何：stage 尺寸、页面原点与滚动偏移

每次同步几何时计算（`PAD` 沿用现有 `min(72, max(24, min(clientW, clientH) * 0.08))`，`chromeTop = 工具条高度 + 24`）：

```
contentW = pageW * scale + PAD * 2
contentH = pageH * scale + chromeTop + PAD * 2
stageW   = max(clientW, contentW)
stageH   = max(clientH, contentH)

originX  = stageW  > clientW ? PAD : (clientW - pageW * scale) / 2
originY  = stageH  > clientH ? chromeTop + PAD
                             : chromeTop + (clientH - chromeTop - pageH * scale) / 2

scrollX  = clamp(scrollEl.scrollLeft, 0, stageW - clientW)
scrollY  = clamp(scrollEl.scrollTop,  0, stageH - clientH)
offsetX  = originX - scrollX
offsetY  = originY - scrollY
```

- `#canvas-stage` 尺寸设为 `stageW × stageH`；`#leafer-view` 绝对定位在 stage 内 `0,0`，`transform: translate(originX, originY) scale(scale)`。
- `offsetX/offsetY` 仍然相对 overlay（等于滚动容器的可视区左上角），所以 `toScreen/toPage`、`pageScreenRect()`、`handleAt`、`dividerAt`、`marginAt`、`drawOverlay`、行内 textarea 的 `scale()` 全部无需改公式，只是 offset 里多减了滚动量。
- 页面未超出时 `stageW === clientW`，`originX` 走居中分支且滚动量为 0，与当前适配行为一致。
- 滚动条出现会改变 `clientW/clientH`，因此写完 stage 尺寸后需要再测量一次 client 尺寸并重算几何；实现上用一个 `syncGeometry()` 连续执行两遍（第二遍读回真实 client 尺寸），避免滚动条出现/消失导致 1px 抖动。

### 4. 滚动事件、滚轮转发与缩放锚点

- 原生滚动：`#canvas-scroll` 的 `scroll` 事件里只更新 `offsetX/offsetY` 并重绘 overlay（页面位图本身不变），用 `requestAnimationFrame` 合并连续事件。
- 滚轮：overlay 不是滚动容器的子节点，滚轮不会自动滚动，因此在 `#canvas-pane` 上监听 `wheel`（`{ passive: false }`）：
  - `event.ctrlKey || event.metaKey` → `preventDefault()`，按 `1.08` 的倍率缩放并以指针为锚点；指针位置取 `clientX/Y - scrollEl.getBoundingClientRect()`。
  - 否则把 `deltaY`（`deltaMode === 1` 时 ×16）加到 `scrollEl.scrollTop`，`deltaX` 加到 `scrollLeft`；`Shift + 滚轮` 走横向。
- 锚点换算：锚点页面坐标 `p = (pointer - offset) / oldScale`；新比例下目标 `scrollLeft = originX' + p.x * newScale - pointerX`，纵向同理，再 clamp 到新的最大滚动范围。按钮与百分比输入用可视区中心作为锚点。
- `fit` 模式下滚动容器不应有可滚动区域（stage 等于 client 尺寸），切回 fit 时把 `scrollLeft/Top` 归零。
- 触屏与触控板：本设计不处理双指捏合；触控板双指滚动产生的 wheel 事件按普通滚动处理。

### 5. 缩放控件放进现有画布工具条

按 `DESIGN.md` 的 “不要新增整行工具栏”，缩放组作为工具条内的第三个组，放在插入组之后，用 1px 竖线分隔：

```
[第 N 页] [+] [🗑] | [添加文字] [添加图片] | [−] [ 42% ] [+] [适应窗口]
```

- 百分比用 `<input type="text" inputmode="numeric">`（宽约 56px，右对齐等宽数字），显示 `Math.round(scale * 100) + '%'`。Enter/blur 提交，Escape 还原，非法输入还原；提交时去掉 `%` 并 clamp 10–400。
- 显示值在 fit 模式下是 `fitScale` 的百分比；点击 ± 或输入即切 manual。
- ± 步进 10 个百分点；在 10% 与 400% 时禁用对应按钮（`disabled` + aria-disabled）。
- 按钮沿用现有 `.icon-btn` / `.btn.btn-sm`，缩放组沿用 `.canvas-toolbar-group`；窄画布时工具条本来就会 `flex-wrap`，缩放组整体换行，不再单独设计窄态。
- 绑定放在 `ui.js`（与其它工具条按钮一致），实际状态变更与重绘调用 `L.app` 暴露的方法；`app.js` 不直接查控件 id。

### 6. 重绘职责拆分

- `fit()` 保留为“进入适应窗口”的语义：置 `mode = 'fit'`，归零滚动，然后 `redraw()`。
- 新增 `syncGeometry()`（测量 + 算比例 + stage 尺寸 + offset）、`applyViewTransform()`（原有 CSS transform + overlay 尺寸）、`redrawContent()`（页面位图）与 `drawOverlay()` 的现有分工。
- `redraw()` 仍用于内容或页面变化：`syncGeometry()` → 同步 scroll（若需要）→ 页面重绘 → overlay。
- 滚动时只调用 `syncScrollOffsets() + drawOverlay()`，不重画 Leafer 页面，避免滚动卡顿。
- `resize` 监听保留，`fit` 模式重新适配，`manual` 只同步几何与滚动范围。

## Risks / Trade-offs

- **缩放后的清晰度**：页面位图是 LeaferJS 在 `pixelRatio ≤ 2` 下渲染的固定分辨率，CSS 放大到 200% 以上时文字会变软（400% 时约 2 倍拉伸）。这是为了避免高倍缩放时把画布位图扩大到数百 MB 的有意取舍：视图缩放用于布局校对，最终清晰度由导出 PNG 决定。若后续需要像素级校对，再单独设计按缩放级别重建表面的方案。
- **滚动与坐标错位**：任何一处仍假设 `offsetX/Y` 只是居中偏移，都会在滚动后点错元素。缓解：所有屏幕坐标继续只经由 `toScreen/toPage/pageScreenRect()`，实现时全量搜索 `viewport.offset` 的直接引用并核对；重点验证行内 textarea 与 margin/divider 手柄。
- **滚动条引起的尺寸回环**：出现纵向滚动条会变窄 `clientWidth`，可能再触发横向滚动条。缓解：stage 尺寸写入后二次测量 client 尺寸，并按最终值计算 origin/scoll；接受极端情况下滚动条短暂出现/消失一帧。
- **工具条换行改变 `chromeTop`**：窄窗口下缩放组换行会让工具条变高，页面可用高度减少。缓解：`chromeTop` 每帧从工具条实际高度读取（现有做法），不缓存。
- **滚轮行为与浏览器缩放冲突**：`Ctrl + 滚轮` 必须 `preventDefault` 且监听非 passive，否则浏览器会缩放整个页面；在 Chrome/Edge 的 `file://` 下实测确认。
- **`fit` 比例低于 10%**：超大页面在窄窗口下 `fitScale` 可能小于 10%，这与固定比例下限不冲突（规范只约束 manual），但从 fit 点“缩小”时会先跳到 10%，看起来像放大。缓解：该边界仅在极小画布下出现，按钮步进逻辑以 `max(10, round(fitScale*100) - 10)` 处理，必要时在实现时用一次实测确认可接受。
- **Leafer 与 overlay 的 DPR**：overlay 尺寸继续按 `clientWidth * devicePixelRatio` 分配，滚动条使 client 尺寸变化时同步重设，避免模糊或拉伸。

## Migration Plan

纯前端视图改动，无数据迁移。旧项目 JSON 不含缩放字段，加载后默认进入适应窗口。回滚只需还原 `index.html` / `style.css` / `js/app.js` / `js/ui.js` 与 `DESIGN.md`。
