# Design

## Context

- 画布是叠放的 canvas，最上层 `overlay` 负责选择框与手柄，光标通过 `overlay.style.cursor` 设置（`js/app.js` 的 `updateCursor()`）。
- 图片手柄几何由 `imageHandlePoints(element)` 统一计算：它已经按 `model.rotationRadians(element)` 旋转八个锚点，同时被内容图片（`handlePoints` → `drawSelection`/`handleAt`）和背景图片（`drawBackgroundSelection`/`handleAt` 的 `resize-background`）复用。当前每个手柄硬编码一个系统光标关键字（`nwse-resize` / `ns-resize` / `nesw-resize` / `ew-resize`）。
- CSS 光标不能按角度旋转，只能换成一张“画好旋转”的位图；`cursor` 支持 `url(...) <x> <y>, <fallback>` 列表。
- 项目要求零构建、无网络、仅经典 `<script>`；不要引入文件或构建步骤。
- 图片旋转写入元素/背景图的 `rotation`（度），拖拽缩放 `model.computeImageResize()` 已经按旋转角反算，光标只影响视觉提示，不改变拖拽行为。

## Goals / Non-Goals

**Goals:**

- 任意旋转角下，八个手柄的光标方向与图片本地边界方向一致；四角固定为旋转角 + 45°。
- 角度变化（属性面板、撤销/重做）后光标立即刷新，不要求用户移动指针。
- 自定义光标失败时退回当前行为，不出现“没有光标”的退化。

**Non-Goals:**

- 不改选择框/手柄的绘制形状，不改拖拽、等比锁定或锚点计算。
- 不为 `move`、列分隔线、页边距、页尺寸手柄做方向化光标。
- 不引入旋转手柄，不改数据模型、导入导出或任何持久化格式。
- 不追求每个角度一张手绘图标；只用一个可参数化旋转的双向箭头字形。

## Decisions

### 1. 用内联 SVG data URI 自定义光标，而不是 8 向关键字吸附

把 32×32 的 SVG（白色描边 + 深色箭头，双向箭头居中）整体 `rotate()` 后编码进 `url("data:image/svg+xml;charset=utf-8,…")`，热点固定 `16 16`。

- 备选：按 22.5° 分桶映射到 8 个系统关键字。零兼容风险，但 30° 这类角度最多偏 22.5°，跨越分桶还会跳变，不满足“垂直于边界”的要求。
- 选择 SVG 的原因：任意角度连续、零依赖、`file://` 可用；32×32 是 Chrome/Edge 的硬上限，超过会被静默丢弃。
- 光标串用 `encodeURIComponent` 编码并用引号包裹，避免 `#`、`"` 破坏 `url()`。

### 2. 手柄的基准角度与回退关键字

`cursorAngle(name, rotationDeg)`：`e`/`w` → `rotation`，`n`/`s` → `rotation + 90`，四角 → `rotation + 45`（固定，不用 `atan2(h, w)`，与方形手柄观感一致）。结果对 180° 取模（双向箭头对称）。

- 基准角在标准方向（0/45/90/135°，容差 0.5°）时直接返回系统关键字，字重和观感更原生，也减少自定义光标使用；`rotation = 0` 因此与当前版本完全一致。
- 非标准角返回 `url("…") 16 16, <最近的标准关键字>`，第二项保证浏览器不支持 SVG 光标时仍有正确的粗略方向。
- 关键字映射（屏幕 y 向下、正角顺时针）：0→`ew-resize`、45→`nwse-resize`（`\`）、90→`ns-resize`、135→`nesw-resize`（`/`），180 取模后复用。该映射在 0° 时与现有硬编码完全一致（`e/w` 水平、`n/s` 垂直、`se/nw` 为 `nwse`、`ne/sw` 为 `nesw`），可作为改造后的回归基线。

### 3. 缓存按“1° 归一化角度”而不是按元素/手柄

SVG 字形本身与手柄类型无关（都是双向箭头），只随角度旋转。用 `Map<number, string>` 缓存角度→光标串，角度四舍五入到整数度并归一到 `[0, 180)`：

- 最多 180 项，无需淘汰；属性输入本来就是整数度，命中率极高。
- 用 `lastAppliedCursor` 去重：`pointermove` 高频触发时，只有光标串真正变化才写 `overlay.style.cursor`，避免浏览器每帧重新解码 data URI。

### 4. 光标刷新点收敛到 `updateCursor()`，并记录悬停位置

新增 `hoverPoint`（overlay 坐标）：

- `onPointerMove`（非拖拽分支）记录并调用 `updateCursor()`；`pointerleave` 清空。
- `redraw()` 画完 overlay 后，若 `hoverPoint` 存在且不在拖拽/行内编辑中，重跑一次 `updateCursor()`。这样属性面板改旋转角、撤销/重做、切换选择后无需移动指针也能刷新。
- 不改现有拖拽中的光标逻辑（拖拽时本来不更新光标）。

### 5. 改动留在 `app.js`

新增一组纯函数（角度归一化、关键字映射、SVG 生成、缓存）并改造 `imageHandlePoints()` 返回的 `cursor`。不新增 `js/*.js` 文件，避免动 `index.html` 与 `build.sh` 的资源清单；这部分逻辑只服务画布命中，放在 `app.js` 与现有手柄代码同处最自然。

## Risks / Trade-offs

- **Chrome/Edge 32×32 上限** → 固定 32×32、箭头画在中间约 18px 区域内；超过上限的图片会被整个丢弃，绝不能放大。
- **Safari 对 SVG 光标支持不完整** → 始终附带第二项系统关键字；最坏情况退回今天的视觉，不会没有光标。
- **data URI 反复赋值导致光标闪烁/解码开销** → `lastAppliedCursor` 去重 + 角度缓存。
- **1° 量化** → 30.4° 显示为 30°，肉眼不可辨；不引入累积误差（量化只发生在光标查询，不回写 `rotation`）。
- **高 DPI 下 32px 光标略糊** → 箭头用粗描边、无细线细节；保持 32px 是兼容性优先的取舍。
- **光标方向与真实缩放轴在极端宽高比下有偏差**（四角固定 45°）→ 与现有方形手柄的形状一致，且用户已确认该取舍。

## Migration Plan

- 无数据迁移：不新增字段、不改 JSON、不影响导出。
- 回滚只需还原 `js/app.js` 中手柄光标相关改动；旧项目文件不受影响。
- 验证：`./build.sh` 不涉及（无新资源）；在 Chrome 手动旋转图片到 0°/30°/45°/90° 悬停八个手柄，再用 `agent-browser` 断言 `overlay.style.cursor` 分别为系统关键字（0°/标准角）与带 `data:image/svg+xml` 的自定义值（非标准角）。
