# Design

## Context

见 proposal.md 的 Why。现状关键点（均已在代码中核实）：

- `js/shape.js`：`SHAPE_KINDS = ['rect','diamond']`、`SHAPE_MODES = ['fill','stroke']`、`DEFAULT_SHAPE`、`normalizeShape`/`clampShape` 白名单；inradius（边框上限）与命中判断为每形状分支。
- `js/render.js`：`drawShape` → `traceShape(ctx, item)` 按形状画路径，`fill`/`stroke` 通用；效果走离屏 canvas，与形状无关。
- `js/project-io.js`：序列化与读入各有一处 `shape === 'diamond' ? 'diamond' : 'rect'` 白名单（约 L68、L369），是旧版本数据回落点。
- `js/app-interactions.js`：`shape-draw` drag 对象（startX/startY/currentX/currentY/moved）→ `state.shapeTool.preview` 矩形 → `createShapeFromDrag` 落地；单击（`moved=false`）插入 240×240。已有 `bindSnapModifier`/`unbindSnapModifier` 修饰键监听模式可复用。
- `js/ui-property-panel.js`：形状下拉（`prop-shape-kind`：方形/菱形）、填充方式、圆角、边框厚度均按 `item.shape` 条件渲染；菱形已有"按形状显示专属字段"的先例。
- Node 回归 `scripts/checks/` 已覆盖 shape.js 纯逻辑（`shape.test.js`），无 canvas 依赖。

## Goals / Non-Goals

**Goals**

- `SHAPE_KINDS` 增加 `circle` 与 `line`，贯通 渲染/序列化/属性面板/命中/绘制预览。
- Ctrl 约束绘制：圆形 → 正方形外接框（正圆），直线 → 45° 步进方向；默认自由。
- 直线进入形状下拉，任意形状可切换为直线。

**Non-Goals**

- 椭圆作为独立类型（圆形本身宽高不等即为椭圆）。
- Shift"从中心绘制"、任意角度吸附步进设置、多段/折线工具。
- 直线的独立 x1/y1/x2/y2 数据模型（沿用外接框）。
- 旧版本应用读取 circle/line 项目的兼容（沿用白名单回落 rect 的既有行为）。

## Decisions

### 1. 直线采用「框随方向」模型：框 = 长度 × 线粗，方向由旋转表达

线段不单独存储端点：`width` 即线长，`height` 即线粗（与 `strokeWidth` 同步），`rotation` 即线段方向；线段在局部空间中恒为框的水平中线（居中），外接框随方向旋转。备选的「轴对齐外接框 + 端点/flip」模型被用户否决：横线的框高退化，厚度被 min(宽,高)/2 上限锁死无法加粗，且框手柄语义混乱。具体规则：

- `clampShape` 对 line 强制 `height = strokeWidth`、`radius = 0`，厚度上限为线长一半（`shapeInradius` line 分支返回 width/2）；
- 旧数据迁移（project-io 读入）：旧 flip/端点数据按「线段长度 = hypot，方向 = 旧 rotation + 端点角度」换算为 长度 × 线粗 + 旋转，线段中点（= 旧框中心）锚定；
- 渐尖（`taper`）与命中（框内中线带）在新模型下不变。

### 2. Ctrl 约束挂在 drag-move 计算处，监听复用 bindSnapModifier 模式

- 在 `shape-draw` 的 move 处理中读取 `event.ctrlKey`（指针事件自带修饰键状态，无需额外 keydown 监听即可覆盖按下/松开的实时切换）：
  - circle：`span = max(|cx|, |cy|)`，按 startX/startY 与位移方向符号重建正方形外接框；
  - line：以起点为端点，角度 `atan2(dy,dx)` 四舍五入到 45° 步进，按长度投影重算终点；外接框为起点与终点的包围盒。
- 单击插入的默认值按形状分流：circle 240×240（正圆），line 240×8 水平线段，其余 240×240。
- 备选"全局 keydown 记录 Ctrl 状态"被否：pointer event 自带 `ctrlKey`，少一套监听生命周期。

### 3. shape.js 每形状分支的最小扩展

- `shapeInradius`：circle 与 rect 同式（min(w,h)/2）；line 固定用 min(w,h)/2 作边框上限（线粗夹取）。
- `traceShape`/命中：circle 画 `ellipse` 路径、命中按椭圆方程；line 画对角线段、命中按点到线段距离 ≤ strokeWidth/2 + 容差（带状区域）。
- 圆角：line MUST NOT 应用圆角——`clampShape` 对 line 强制 `radius = 0`，属性面板隐藏圆角输入。

### 4. 属性面板与序列化

- 形状下拉增加 圆形/直线；直线下隐藏圆角字段（沿用菱形内夹角的条件渲染先例）；自由图形提示文案按形状显示（方形/菱形/圆形/直线）。
- `project-io.js` 两处白名单改为四值集合；`flip` 仅在 line 时写入，读入缺省 false。
- 形状切换保留外接框（与菱形既有行为一致），切到 line 时 radius 归零由 clampShape 兜底。

### 5. 直线两端渐尖：`taper` 字段 + 锥形多边形填充

- 数据：新增可选字段 `taper`（≥0 数值，默认 0），仅 line 有意义；`normalizeShape`/`clampShape` 归一负值与非法值；序列化仅 line 写入，读入缺省 0。
- 渲染：`taper > 0` 时线段不用 stroke 画，改为锥形多边形填充——中段保持 `strokeWidth` 全宽，两端各在 `taper` 距离内线性收窄至端点成尖（四边形或六边形顶点，一次 `fill()` 完成）；`taper = 0` 走既有描边路径。
- 长度夹取：线段长度不足以容纳两侧渐尖时按 `length / (2×taper)` 等比缩小实际渐尖距离，保证中段存在完整线粗部分。
- 命中与几何：渐尖只改外观，不改变命中带状区域、外接框与撤销粒度；`mode` 对渐尖线段无差别（线段本身即描边语义）。
- 属性面板：直线专属数值输入（沿用菱形内夹角的条件渲染先例），负值就地夹取为 0。
- 备选"stroke 渐变宽度/多次分段描边"被否：canvas 不支持沿路径变宽的 stroke，多段拟合顶点多且接缝可见，一次填充的多边形最简单且效果平滑。

## Risks / Trade-offs

- [对角线建模在缩放手柄上的体验] 直线缩放改变端点在框内位置，语义成立但不如独立模型直观 → 规格已按外接框语义写明，实现遵循即可。
- [project-io 白名单遗漏导致 circle/line 回落 rect] → tasks 中单列项目读写回归用例（Node 可测）。
- [Ctrl 与浏览器快捷键冲突] 画布内拖拽时按 Ctrl 不触发浏览器行为（非点击）；不使用 Ctrl+滚轮等组合，无冲突面。
- [45° 吸附的 atan2 边界抖动] 吸附仅在拖拽 move 中重算，无状态累积，松手即定，不存在抖动放大。

## Migration Plan

纯前端增量：无持久化格式破坏（新增枚举值在旧版本按既有白名单回落 rect）。回滚 = 还原本次改动文件。

## Open Questions

无（两个交互分歧已在探索期由用户决策：直线进入形状下拉；Ctrl = 约束、默认自由）。
