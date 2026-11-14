# Design

## Context

当前屏幕渲染是单画布全量重绘：`redraw()`（js/app.js:352）在每个交互事件里直接执行 `syncGeometry()`（读 `clientWidth/clientHeight` 与 `getBoundingClientRect()`，写 stage 尺寸 → 强制 reflow）→ 整页 `clearRect` + `renderer.drawPage()`（背景 + 所有元素，每个分类逐帧重算 `layoutCategory`：O(歌曲数) 次 measureText，justify 逐字 measure/stroke/fill）→ Leafer `paint()` 合成 → `drawOverlay()`（其中 `pageOverflow`/`drawSelection` 再次触发 `layoutCategory`）→ rAF 里再跑一遍几何重测。`element._layoutByMode` 缓存槽只写不读（js/layout.js:318-319）。背景图 X/Y/宽/高/旋转的提交走 `setBackgroundImageValue` → `ui.renderAll()`（js/app.js:2186-2193），整面板 DOM 重建导致输入失焦、连续步进中断。

关键事实（已核实）：

- 导出（js/export.js:65-71）自建画布直接调 `drawPage`，与屏幕 surface 完全独立 → 屏幕分层不影响导出。
- `#leafer-view` 是空 div（index.html:85），surface 由 `setupSurface()` 运行时注入；`#overlay` 是独立的视口尺寸 canvas（index.html:88）。
- 已存在 plain canvas 回退路径（`surfaceIsLeafer=false`，js/app.js:214-223），证明脱离 Leafer 的像素化方案可行。
- `layoutCategory` 的输入只含 歌曲列表、`element.width`、titleStyle/songStyle、tables 配置、editMode；不含 `element.x/y`（x 偏移在 drawCategory 绘制时叠加，render.js:229-234）→ 布局可按输入缓存。

## Goals / Non-Goals

**Goals:**

- 背景图操作（拖动/缩放/旋转/透明度/模糊）的每帧成本与内容层文字数量解耦。
- 交互事件按动画帧合并，每帧至多一次画布更新；连续交互期间无强制 reflow。
- 同一元素同一状态的文本布局在一次重绘内只计算一次（绘制、溢出检测、选择框共享）。
- 背景图数值输入就地提交，焦点保留，连续步进不中断。
- 视觉结果与现有实现逐像素一致（含导出）。

**Non-Goals:**

- 不改变数据模型、项目 JSON 格式、导出输出、预置管线、构建脚本。
- 不改变布局算法（列宽计算、填充顺序、换行规则）。
- 不引入测试框架/CI（按 AGENTS.md 手工 + agent-browser 验证）。
- 不重写属性面板 UI 结构（分组卡片、折叠等保持不变）。
- 不追求 200% 以上缩放的超采样清晰度（与现状一致：位图 CSS 缩放）。
- 不引入 WebGPU/WebGL/Worker 渲染路径：Canvas2D 在 Chrome 中已是 GPU 栅格化，当前瓶颈在布局测量、强制 reflow、滤镜与全页填充，换渲染 API 不解决这些问题。

## Decisions

### D1 渲染分层：两个叠放的 plain canvas（放弃 Leafer surface）

`#leafer-view` 内创建两个等尺寸 `<canvas>`：`#bg-canvas`（填充色 + 背景图片，`drawBackground` 路径）在下，`#content-canvas`（分类/文字/自由图片，`drawPage` 去掉背景的部分）在上（透明）。两个 canvas 共享同一 CSS transform（沿用 `applyViewTransform` 对 `#leafer-view` 的 transform），位图尺寸 `pageW×pageH×dpr`（dpr 取 `min(2, devicePixelRatio)`，与现 Leafer pixelRatio 上限一致）。`#overlay` 保持现状最上层。

- 为什么两个 DOM canvas 而不是「单画布 + offscreen 内容缓存每帧 blit」：背景变化时内容 canvas 零成本（浏览器不重绘未变化的 canvas 区域），比每帧整页 `drawImage` 位图更省；且 DOM 叠加天然满足「背景在下、内容在上、overlay 最上」的层级，导出路径不受影响。
- 为什么放弃 LeaferJS surface：当前只是借用 Leafer Canvas 的位图能力，app 全部手工绘制；两个 plain canvas + 现有回退路径的逻辑即可覆盖，少一层合成。vendor 的 `leafer-editor.min.js` 与 filter 插件 script 标签本次保留（删除属独立清理），`setupSurface` 的 Leafer 初始化分支移除。
- `syncSurface` 逻辑改为同时同步两个 canvas 的位图尺寸（页尺寸变化时重建）。
- 位图比例按像素预算收敛：`ratio = min(2, devicePixelRatio, sqrt(MAX_CANVAS_PIXELS / (pageW * pageH)))`，`MAX_CANVAS_PIXELS` 取 16M。1080×1920 页仍为 2×；5000×5000 页自动降到约 0.8×，避免两层位图被推到数百 MB（当前 5000×5000 @2× 单层即约 400MB）。

### D2 重绘调度：脏标记 + rAF 合帧，几何重测移出热路径

`redraw()` 改为 `scheduleRedraw(layers)`：置 `bgDirty/contentDirty/overlayDirty` 标志，`requestAnimationFrame` 回调里按脏标志分别重绘对应 canvas（同一帧多事件自然合并）。交互入口（`onPointerMove` 各分支、滑条 `input`、数值 `input/change`、属性提交）只置脏标志，不再同步重绘。

- `syncGeometry`、`applyViewTransform`、`updateZoomUI` 不再每帧调用：只在页尺寸变化、窗口 resize（现有 `handleResize`）、缩放模式/百分比切换、滚动同步、初始化时执行。`redraw()` 内同时移除 `scheduleGeometryReflow()`（它会在下一帧再跑一次 `syncGeometry`，几何变化时还会二次 `drawOverlay()`）与 `scheduleDraftSave()`（草稿改由合帧回调在模型变更后统一调度）。拖动期间视口不变，无需重测 → 消除每帧强制 reflow 与重复绘制。
- 备选 `setTimeout` 节流：拒绝，rAF 与显示刷新对齐且自动丢帧合并。
- 首帧延迟上限一帧（≤16ms），不可感知。
- overlay 的选择框/手柄在拖动中需要跟随：拖动分支同时置 `overlayDirty`（仅交互层，见 D6）。

### D3 布局缓存：`_layoutByMode` 改为按输入键命中

`layoutCategory` 入口计算**布局签名**：歌曲列表、`element.width`、`showTitle`、字体测量相关字段（`fontFamilies/fontFamily/fontSize/fontWeight/fontStyle`）、`lineHeight`、表格配置（columns/rows/fill/align/widthMode/widths/margins）、`editMode`；**不包含**颜色/阴影/描边等纯绘制字段（否则拖动颜色选择器会误触发全量测量）。签名必须在 `normalizeTables()` 之后计算；rAF 帧开始时递增 `frameToken`，元素缓存记录 token，同帧内重复调用（绘制、溢出检测、选择框）直接返回结果。`layoutText` 同理（text、width、字体测量字段、lineHeight；align 不影响换行）。

- 键成本：签名只含标量字段，避免整份 style 的 `JSON.stringify`；同帧复用后每元素每帧至多计算一次。
- 失效语义：布局完全由输入派生，签名变即重算；`element.x/y` 不在键内（绘制时叠加），因此连按 X 箭头命中缓存。
- `drawPage`/`pageOverflow`/`drawSelection`/`tableDividers` 继续调用同一函数 → 自动共享命中结果，无需额外传递。
- 保留现有「每帧覆盖写缓存槽」行为作为兼容（导出路径 `editMode:false` 与编辑路径 `'edit'` 分开缓存）。

### D4 背景图数值输入就地提交

`setBackgroundImageValue` 去掉 `ui.renderAll()`，改调 `changed({property:false})`（仅置脏重绘）；提交后把输入框 `value` 强制回写为模型值（覆盖越界/非法输入的显示校正，替代原先 renderAll 的重建校正）。`setBackgroundImageFit`（fit 模式切换会改变字段结构，X/Y/宽/高区块显隐）保留 `renderAll()`。其余面板输入（元素 X/Y、样式等）已走 `changed({property:false})`，无需改动；`editor-shell` 新需求将其上升为契约。

### D5（可选）文字绘制成本预计算

若 D1-D4 落地后多歌页面内容层重绘仍超帧预算：justify 单元格的逐字 metrics（每字宽度、间距）在 `assignTableSongs` 阶段一次算好存于 cell，`drawJustifiedText` 只按表绘制；阴影文本保持现有两遍绘制不动（canvas shadow 优化收益不确定，不做投机实现）。此项以实测为触发条件，默认不实施。

### D6 页面装饰层与交互层分离

`#overlay` 目前把静态装饰（页面阴影、边框、边距参考线与手柄、溢出徽标、页尺寸手柄）与动态交互（选中框、缩放手柄、表格分隔线）画在同一张视口画布上。背景图被选中时手柄画在 overlay（`drawBackgroundSelection`），因此背景拖拽每帧都会重绘整张 overlay，连带 `shadowBlur: 24` 的页面阴影与 `pageOverflow()` 的全元素布局。

- 新增 `#overlay-chrome`（位于 `#overlay` 下层、同尺寸）：只画静态装饰，仅在 `geometryDirty || contentDirty` 时重绘。
- `#overlay` 只画选择框/手柄/表格分隔线，每帧重绘成本与元素数量无关。
- `pageOverflow()` 结果按 `overflowDirty`（内容或页尺寸变化）缓存，背景操作期间不重算。
- 内存代价：多一张视口位图（`viewportW × viewportH × dpr² × 4B`，1080p@2x 约 16MB），桌面编辑器可接受。

## Risks / Trade-offs

- [两 canvas 的文本抗锯齿与单 canvas 存在亚像素差异] → 两 canvas 位图尺寸/dpr/坐标完全一致，文本仍在 content canvas 上按原坐标绘制；验证时用截图对比当前实现，允许不可感知的亚像素差异，导出路径不变作为一致性锚点。
- [移除 Leafer surface 影响未知依赖] → 已核实导出与资产管线不依赖 Leafer；vendor script 保留，行为差异可由删除初始化分支后全量手工回归（file:// 打开即走 plain canvas 路径）。
- [布局缓存键遗漏输入导致陈旧布局] → 键覆盖 `layoutCategory` 全部实际输入（已核对函数体）；js/layout.js 已有 devChecks，补一条「缓存命中结果与重算结果一致」的断言。
- [双层整页位图内存：默认 1080×1920 页 dpr2 单层约 33MB、两层约 66MB；1240×1748 页 dpr2 单层约 35MB] → 由 `MAX_CANVAS_PIXELS` 预算收敛，超预算页面自动降低有效比例；overlay 拆层再增加一份视口位图。桌面编辑器可接受，低端设备以像素预算兜底。
- [overlay 拆层后装饰层与交互层不同步] → 两者共用 `geometryDirty/contentDirty` 失效路径；选择变化只置 `overlayDirty`，spec 场景约束背景拖拽期间装饰层不重绘。
- [拖动中途窗口 resize 使几何陈旧] → `resize` 事件已有 `handleResize` 全量重算路径，rAF 合帧只影响绘制频率，不影响 resize 响应。
- [rAF 合帧使单次事件的视觉反馈延迟一帧] → ≤16ms，交互上不可感知；最终值由最后一次事件保证（spec 已约束）。

## Migration Plan

1. 代码一次性替换（无数据迁移：项目 JSON、草稿格式不变，旧草稿直接兼容）。
2. 回归矩阵（手工 + agent-browser）：空页/多歌页的背景图拖动/缩放/旋转/透明度/模糊；元素拖动与 X 箭头连续步进（含 Ctrl+方向键大步进）；缩放/滚动坐标一致；页尺寸/边距拖动；导出 PNG 与现状对比；Leafer script 加载失败场景（plain canvas 回退仍由新双 canvas 逻辑接管）。
3. 回滚：revert 单个 PR 即可，无持久化影响。

## Open Questions

- 「流畅」的量化验收阈值（如 500 首歌下背景拖动单帧 <8ms）在验证阶段用 DevTools 实测确定，不改变规格与方案。
- WebGPU/WebGL：仅在 P0+P1 全部落地后，主线程已空但帧时间仍被图像合成/模糊占满（如 4K 页 + 多层大图）时评估；优先 WebGL2 separable blur 或 DOM/CSS 背景层，不做文字渲染迁移。
- vendor Leafer 文件与 filter 插件的删除时机，另立独立清理任务，本次不处理。
