# Design

## Context

画布已有成熟的、感知旋转的选择框/手柄系统：`imageHandlePoints(element)` 用 `model.rotateVector` 把 8 个缩放手柄（nw/n/ne/e/se/s/sw/w）绕图片中心摆好，`drawSelection`/`drawBackgroundSelection` 画旋转后的选框与方形手柄，`handleAt` 命中并返回 `resize`/`resize-background`，`updateCursor` 给旋转感知的悬停光标。拖拽走 `surface.drag = { type, … }` + `actions.pushUndo()` + `beginPointer()`（`setPointerCapture` + 冻结 blur 缓存），移动时改字段并 `viewport.scheduleRedraw([...])`。

旋转数学已齐备：`model.rotationRadians`、`model.rotateVector`；角度归一 `ui.normalizeAngle`（→ [-180,180]，0.1 精度）。两条回写通路：内容图 `setElementField('rotation', …)`（经 `changed()` 重绘面板），背景图 `setBackgroundImageValue(set, img, 'rotation', …)`（同步 `prop-bg-rotation` 输入并 `scheduleRedraw(['bg','overlay'])`）。

现状缺口：`imageHandlePoints` 只有 8 个缩放手柄，`handleAt` 只认 resize；旋转只能靠属性面板数字框。画布滚轮已被缩放占用（`app-viewport` `onCanvasWheel`）。

约束：零构建、经典 `<script>`；工具函数单一实现；背景层与内容层更新解耦（`canvas-view`）。

## Goals / Non-Goals

**Goals:**
- 为内容自由图片与背景图共用**一个**旋转手柄：选框顶边中点向上伸出 stem（~24px），末端圆形手柄 + grab 光标。
- 圆周拖拽 → 绕元素中心旋转；默认吸附 15°，Ctrl/⌘ 自由拖；拖拽中显示当前角度。
- 命中优先级、悬停光标、缩放/滚动后对齐与现有 spec 一致；内容/背景共用同一套。
- 计数入撤销；回写复用既有通路与既有角度范围。

**Non-Goals:**
- 不做“滚轮旋转”（滚轮保持缩放）。
- 不为自由文字加旋转（`page-editor`：文字第一版不支持旋转）。
- 不改缩放手柄行为、不改旋转角度输入框的 min/max 语义。

## Decisions

1. **手柄几何（顶边中点 + stem）**：新增第 9 个点，`drawSelection`/`drawBackgroundSelection` 先画 stem 线，再复用现成 `drawRoundHandle` 画圆。stem 起点为顶边中点（即 `n` 手柄位置），终点沿旋转后的法线 `rotateVector(0, -h/2, rad)` 向外偏移 ~24px。
   - 理由：与 Figma/PowerPoint 一致、可发现；复用 `rotateVector` 使其在缩放/滚动下自动对齐（满足 `canvas-view` 坐标一致）。
   - 备选：角点处旋转柄（非常规）；在图片上直接拖（与“拖=移动”冲突）。均否决。

2. **手势→角度数学（中心角增量）**：指针经 `viewport.toPage` 转页面坐标；`center = (x+w/2, y+h/2)`。按下：`startPointerAngle = atan2(sy-cy, sx-cx)`、`startRotation`。移动：`deltaDeg = norm180(atan2(my-cy, mx-cx) - startPointerAngle)`（`norm180` 归一到 (-180,180] 防 ±180° 接缝跳变），`newRotation = startRotation + deltaDeg`。
   - 理由：绕中心时“指针绕中心的角度增量”恰等于“旋转增量”，简洁稳健；避免逐帧增量累加漂移，也避免绝对角度映射在手柄另一侧时的跳变。
   - 备选：逐帧累加（漂移）；绝对角度映射（跨侧跳变）。均否决。

3. **吸附**：写回前 `snap = Math.round(newRotation / 15) * 15`；按住 Ctrl/⌘ 时不吸附。
   - 理由：兼顾随手粗调与精调；15° 为默认网格。
   - 备选：常自由（不精）、1°（过细）。

4. **光标**：为旋转手柄配独立旋转光标（环形双向箭头），复用 `rotatedCursorSvg` 式 data-URI；`updateCursor` 悬停到该点时应用；背景图与内容图一致。
   - 理由：spec 规定旋转手柄有独立悬停光标规则且背景与内容一致。
   - 备选：复用 grab（表意不足）。

5. **命中与优先级**：`handleAt` 中**在缩放手柄之前**命中旋转手柄（其圆形略大，命中半径 ~9–10px）；stem 线本身不设命中区。整体优先级沿用 `onPointerDown` 现状：页面尺寸手柄（最先）> 缩放/旋转手柄 > 列分隔线 > 抓取选中元素。
   - 理由：对齐 `page-editor`“页面手柄、元素缩放/旋转手柄与列分隔线 SHALL 仍优先于抓取选中元素”。

6. **回写与范围**：内容图 `setElementField('rotation', ui.normalizeAngle(newRotation))`（`changed()` 重绘面板）；背景图 `setBackgroundImageValue(setId, imageId, 'rotation', wrapped)`，`wrapped` 归一到输入框范围 [-360,360]。不改输入框 min/max。
   - 理由：保持既有范围与“面板输入就地提交”；渲染本就用 `rotationRadians`（按值 mod 360），归一不影响绘制。

7. **撤销/指针**：按下时 `pushUndo('旋转图片')`/`('旋转背景图片')`，复用 `beginPointer()`；与现有拖拽类型一致。

8. **重绘分层**：移动时改模型 + `scheduleRedraw`，内容图 `['content','overlay']`、背景图 `['bg','overlay']`——与既有 resize 拖拽所用层一致，满足“背景层与内容层更新解耦”。

9. **当前角度徽标**：拖拽期间在 overlay 层、手柄附近绘制取整角度；非拖拽不显示。

## Risks / Trade-offs

- [旋转柄与 `n` 缩放手柄在顶边中点重叠] → `handleAt` 先命中旋转柄；stem 保持短（~24px），`n` 方形手柄仍在其内侧可点。
- [`atan2` 在 ±180° 接缝的连续性] → 每帧对“角度差”做 `norm180` 归一，避免 359°→1° 的整圈跳变。
- [连续拖拽产生超范围角度] → 内容图每次写回 `normalizeAngle`→[-180,180]；背景图归一到 [-360,360]；渲染按 mod 360，归一不改视觉。
- [性能] → 每帧一次 `atan2` + 合帧重绘，成本极低；`scheduleRedraw` 已合帧。
- [误触] → 仅选中状态下显示手柄；命中半径小；与“拖=移动”通过 `onPointerDown` 优先级分离。

## Migration Plan

- 无数据迁移：旋转角度已在项目中持久化并往返一致（`project-persistence`）；本 change 纯增量 UI + 一个拖拽类型，无 schema 变更。
- 回滚：改动集中在 `app-chrome.js`/`app-interactions.js`（+ 可选 `model.js` 纯函数），回退这三处 diff 即可移除；不影响已存数据。

## Open Questions

- 当前角度徽标的确切位置/格式（默认：手柄旁取整 `N°`，仅拖拽时显示）。
- 吸附网格默认 15°（备选 10°/45°）——可后续微调，不影响本 change 的方法与任务拆分。
- 背景图超范围角度：归一到 [-360,360]（默认）还是直接 clamp——默认归一。
