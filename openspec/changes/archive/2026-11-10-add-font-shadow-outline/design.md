# Design

## Context

三处文字样式（分类块 `titleStyle` / `songStyle`、自由文字 `style`）目前只有 `fontFamily` / `fontPair` / `fontSize` / `fontWeight` / `color` / `lineHeight`（文字另有 `align`）。渲染全部走 Canvas 2D：`drawCategory` 画标题与歌名（歌名经 `drawJustifiedText` 对齐）、`drawFreeText` 画自由文字，都是 `ctx.fillText`。样式序列化在 `io.js` 的 `serializeStyle` / `loadStyle`（后者委托 `model.normalizeStyle`），默认样式在 `model.js` 的三个 `DEFAULT_*_STYLE`。约束：零构建、`file://` 直开、无新依赖；布局（换行/列宽/行高）由 `layout.js` 独立计算，不能受装饰性设置影响。

## Goals / Non-Goals

**Goals:**
- 三处文字样式各自独立支持阴影（颜色、X/Y 偏移、模糊）与轮廓（颜色、线宽），带开关，默认关闭。
- 画布与 PNG 导出表现一致（导出复用同一渲染路径，天然一致）。
- 项目 JSON 向后兼容：旧项目缺字段 = 关闭；旧版本应用读新项目时忽略未知字段。

**Non-Goals:**
- 不做阴影/轮廓的画布上直接拖拽调整（只走属性面板）。
- 不改变布局计算、虚拟字数、排序规则。
- 不做按表格/单元格粒度不同的阴影轮廓（子分区粒度，与字号/颜色同级）。

## Decisions

**1. 数据形状：样式对象内嵌 `shadow` / `outline` 两个可选子对象。**

```js
shadow:  { enabled: false, color: '#000000', offsetX: 2, offsetY: 2, blur: 4 }
outline: { enabled: false, color: '#000000', width: 2 }
```

- 理由：与现有样式扁平字段并存但不污染顶层；`enabled` 显式开关比“blur==0 视为关”更清晰，避免用户想配 0 偏移 0 模糊的硬阴影时被误判。
- 备选：顶层扁平字段（`shadowColor` 等，贴近 Canvas API）——但开关语义需要额外字段，且与 `fontPair` 的嵌套先例不一致，弃用。

**2. 渲染：复用现有绘制路径，阴影按“整块投影”两遍绘制。**

- 阴影语义 = 绘图软件的 Drop Shadow（投影到后方平面）：偏移 + 模糊的暗色副本位于文字后方，参数一一对应（X/Y 偏移 ↔ 角度/距离，blur ↔ 大小，color ↔ 颜色）。偏移为 0 时退化为贴字光晕，与绘图软件 distance=0 行为一致，属预期而非缺陷。
- 两遍绘制保证投影语义：每个文字区域（分类名行集合、每个歌名单元格、自由文字行集合）先以 `ctx.shadowColor/OffsetX/OffsetY/Blur` 开启绘制全部文字（含描边），再关闭阴影重绘一遍。这样任意偏移方向下阴影都落在同区域文字之后；若逐行单遍绘制，负偏移方向的阴影会叠到上一行文字上，不符合投影语义。
- 轮廓：同一遍内先 `strokeText`（`strokeStyle`/`lineWidth`/`lineJoin='round'`）再 `fillText`，描边在填充之下，避免粗描边吃掉字形内部；`lineJoin: 'round'` 避免尖角字体的描边毛刺。描边形状一并参与投影，与绘图软件一致。
- 保留现有 per-cell / per-element 裁剪：阴影跟随裁剪后可见的文字，超长歌名的阴影不会溢出单元格边界。
- 歌名的对齐绘制（justify 逐字符、center/right 整体偏移）在描边和填充中重复执行同样的坐标逻辑，因此把“画一段文字”抽成小辅助函数，两遍都调用它。
- 备选：LeaferJS 的 `textOutline`/shadow 属性——项目渲染已全面走原生 Canvas（AGENTS.md 领域规则也按 Canvas 描述），不引入第二套绘制路径。

**3. 布局解耦：`layout.js` 不读取 shadow/outline。**

轮廓线宽只影响视觉，`measureText` 仍用 `fillText` 语义的度量，换行/列宽/行高/虚拟字数不变（spec 已约束）。

**4. 序列化：`serializeStyle` 增加 `shadow` / `outline` 字段（始终写出，含 `enabled:false` 默认）；`normalizeStyle` 对二者做容错归一。**

- 归一规则：字段缺失或形状不对 → 用默认值（关闭）；数值字段 clamp（`width` ≥ 0、`blur` ≥ 0、偏移可为负）；颜色缺省 `'#000000'`。
- 旧项目：`loadStyle` 经过 `normalizeStyle` 后自动补上关闭态，不报错、不静默改写其它字段。
- 旧版本应用读新项目：JSON 里多出的 `shadow`/`outline` 键被其 `serializeStyle` 直接忽略（它只挑已知字段），符合 font-selection 既有的向前兼容先例（`fontPair` 同样如此）。

**5. 属性面板：`categoryStyleFields` / `textStyleFields` 在“行距/对齐”之后追加“阴影”“轮廓”两个 field 组。**

- 每组一行开关（checkbox）+ 参数行（颜色 `colorInput`、数字 `numberInput`）；开关关闭时参数行禁用，防止无效编辑。
- 控件 id 沿用现有 `prefix-…` 约定（如 `prop-title-shadow-x`），绑定模式照抄现有 `bind(prefix + '…', 'input', …)` → 写样式 → `L.app.changed()`。
- 三处（标题、歌名、自由文字）共用同一个 `shadowOutlineFields(prefix)` / `bindShadowOutline(prefix, style)` 构造函数，避免三份重复。
- 备注：现有 `syncFontField` 只同步字体族与 fontPair 状态，阴影轮廓无选择器，面板重渲染时直接读样式即可，无需额外同步逻辑。

## Risks / Trade-offs

- [描边覆盖邻行] 大线宽 + 紧行距时上下行描边视觉重叠 → 属用户可调参数，不限制；`lineJoin: 'round'` 缓解毛刺。
- [阴影性能] 大量歌名 + 模糊阴影时 Canvas 每帧重绘变慢 → 现有画布本就整页重绘且项目尺寸有限，不预优化；如出现可缓存无阴影底图，留作后续。
- [旧草稿/旧项目混载] 本地草稿可能来自旧版本 → 走同一条 `normalizeStyle` 归一，缺字段安全降级为关闭。
- [序列化体积] 每处样式多约 20 个 JSON 键 → 项目 JSON 增量可忽略。

## Migration Plan

纯增量：无需数据迁移。加载旧项目时 `normalizeStyle` 补齐关闭态；发布后旧项目文件可继续保存（序列化会写上新默认字段，属无害升级）。回滚 = 恢复代码，旧数据不含新字段不受影响。

## Open Questions

（无——参数集合与开关语义已在本设计中定死，spec 与之对齐。）
