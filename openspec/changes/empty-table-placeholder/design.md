# Design

## Context

当前空动态末表（`rows === 0` 且 0 首歌）在 `assignTableSongs` 中算出 `rowCount = 0`、`height = 0`，画布上完全不可见。关键约束：

- `drawCategory` 对分类块有裁切矩形，高度取 `blockHeight`；空表对 `blockHeight` 贡献为 0（默认边距也是 0），**纯渲染层多画一行会被块裁切掉**——占位行必须进入编辑态布局才能显示。
- `layoutCategory` 的结果被多处消费：渲染（`render.js`）、命中测试与页面溢出标记（`app.js` 经 `elementHeight`）、导出（`export.js`，`editMode: false`）。占位行只应在编辑态生效。
- `layoutCategory` 内部 `normalizeTables` 会改写 `element.tables`（自动续表），且结果缓存在 `element._layout` 上，缓存目前不区分编辑/导出两种视图。
- `addTable` 会先算一次布局来冻结旧动态表行数，这个计算必须基于"数据视角"（不含占位行），否则冻结逻辑被占位行污染。

## Goals / Non-Goals

**Goals:**
- 编辑态下空动态末表显示 1 行红底 + 「空」标签的占位行，占 1 行布局高度；歌名流入后自动消失。
- 导出、项目数据、保存/加载格式完全不变。
- 命中测试、页面溢出标记与编辑态布局一致（所见即所得）。

**Non-Goals:**
- 不改空固定表的显示（它本来就画完整网格）。
- 不改 `addTable`/`removeTable`/`normalizeTables` 的数据行为（只读数据、不写占位行）。
- 不做占位行的拖拽/点击编辑交互（点击仅用于选中块）。

## Decisions

### D1：占位行走编辑态布局分支，而非渲染覆盖层

`assignTableSongs` 增加编辑态分支：当该表是**元素内最后一张表**、`rows === 0`（动态）且 `take === 0` 时，编辑态下 `rowCount = 1`（cells 仍全空），`height = rowHeight`。布局结果上带 `placeholder: true` 标记供渲染层绘制。

- 备选 A（纯渲染覆盖层）：被块裁切矩形裁掉，不可行。
- 备选 B（渲染层扩大裁切矩形）：块外框、命中测试、溢出标记仍按旧高度，四处不一致，拒绝。

导出路径 `editMode: false` 时分支不生效，维持 0 行，现有规格不变。

### D2：`layoutCategory` 增加 `options.editMode` 参数 + 按模式缓存

`layoutCategory(category, element, options)`，`options.editMode` 缺省 `false`。缓存由单一 `element._layout` 改为按模式存放（如 `element._layoutByMode = { edit, export }`），两处缓存必须在现有的失效点同时清除。调用方约定：

- `render.js` 的 `drawPage`：`editMode` 与现有绘制选项一致地传入。
- `app.js` 的命中测试、`pageOverflow`、`elementHeight` 编辑态消费方：传 `editMode: true`。
- `export.js`：显式 `false`（现状不变）。
- `addTable` 内部冻结旧动态表行数的计算：**显式 `editMode: false`**——冻结行数必须来自数据视角，不能把占位行的 1 行算进去。

### D3：占位行视觉（A+ 方案）

- 底色：`#fee2e2`（与溢出红格同色），铺满整行（表格宽 × 行高）。溢出红是"内容盒级"、占位红是"整行级"，形态不同本身即消歧。
- 标签：行内水平垂直居中，文字「空」，浅灰 `#9ca3af`，字号为歌名字号的 0.7 倍（不低于 10px），字体族随歌名样式。
- 列分隔线照常绘制；行高、x、宽度、边距全部沿用该表布局值，手动列宽模式同样适用。
- 标签颜色与字号属渲染细节，不进规格；规格只约束"红底 + 居中小标签"。

### D4：页面溢出判定计入占位行

`pageOverflow`/`elementHeight` 在编辑态用含占位行的块高度，编辑器里"⚠ N 个元素超出页面"所见即所得；歌名流入后警告自然消失。不做导出/编辑差异补偿（导出本身不含占位行，不会误伤导出结果）。

## Risks / Trade-offs

- [缓存陈旧] 双模式缓存若漏清某一处，会出现编辑态看到占位行但命中/高度用旧值的错位 → 在现有 `_layout` 失效点统一改为同时清两个条目，并加一条手动验证（调行数后点占位行区域）。
- [幽灵警告] 编辑器中占位行把块顶出页面会触发溢出警告，而导出图实际不超 → 接受：警告只存在于"表还没歌"的临时态，歌名流入即消失；规格已声明该判定口径。
- [导出回归] 导出路径若误走编辑态分支，PNG 会多一行空白 → 验证项：含空动态末表的项目导出前后 PNG 像素一致（手动比对）。
- [`addTable` 冻结被污染] 若冻结计算用了编辑态布局，空旧动态表会被冻结成 1 行而非现状的 `max(1, 0)` → D2 已显式约定 `editMode: false`，两者结果碰巧一致（均为 1），但语义上必须保持数据视角。

## Migration Plan

无数据迁移：占位行是派生显示，项目结构不变；旧项目加载后自动获得新显示。回滚即还原代码，无残留状态。

## Open Questions

无。标签文案「空」、底色 `#fee2e2`、标签灰 `#9ca3af` 均已在讨论中确认。
