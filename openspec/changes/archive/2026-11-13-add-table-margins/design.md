# Design

## Context

当前表格几何全部由 `js/layout.js` 的 `layoutCategory` / `assignTableSongs` 决定：

- 表格宽度等于分类块宽度 `element.width`，`tableX = 0`，左右贴齐块边缘；标题却额外内缩 `BLOCK_PADDING`。
- 表格纵向从 `BLOCK_PADDING + titleHeight + TITLE_GAP` 开始，`tableY += table.height` 顺序堆叠，表间无间距。
- `blockHeight` 等于末表底边（无行时再加一个 `BLOCK_PADDING`）。
- `js/render.js` 用全局 `computed.tableX`、`computed.tableWidth` 画表格边框、红格、裁剪和列分隔线；`js/app.js` 的分隔线拖拽用 `renderer.tableDividers` 返回的绝对坐标。
- 表格数据由 `js/model.js` 的 `createTable` 创建，`js/io.js` 序列化/加载并校验，属性面板在 `js/ui.js` 的 `tableCard`。

需求见 `proposal.md`，行为契约见 `specs/category-layout/spec.md`。本设计只处理实现路径和边界。

## Goals / Non-Goals

**Goals:**

- 用最小的数据模型改动为每张表格加入独立四边距，旧项目零迁移。
- 让所有依赖表格几何的绘制/命中/拖拽代码都使用每张表自己的 `x`、`width`、`y`。
- 明确边距过大、空表、手动列宽、块宽缩放等退化行为。

**Non-Goals:**

- 不做画布上的边距拖拽手柄；v1 只有属性面板数值输入。
- 不做负边距、边距折叠、表格外框/背景样式。
- 不改排序、填充、动态行、自动续表、列宽算法、导出内容。
- 不为边距引入项目版本号升级。

## Decisions

### 1. 数据模型：每表一个 `margins` 对象，默认全 0

`js/model.js`：

```js
const DEFAULT_TABLE_MARGINS = { top: 0, right: 0, bottom: 0, left: 0 };

function createTable(overrides) {
  return Object.assign({
    columns: 3,
    rows: 0,
    fill: 'column',
    align: 'left',
    widthMode: 'auto',
    widths: [],
    margins: Object.assign({}, DEFAULT_TABLE_MARGINS)
  }, overrides || {});
}

function normalizeMargins(margins) {
  const source = margins && typeof margins === 'object' ? margins : {};
  function value(key) {
    const number = Number(source[key]);
    return Number.isFinite(number) ? Math.max(0, number) : 0;
  }
  return { top: value('top'), right: value('right'), bottom: value('bottom'), left: value('left') };
}
```

- 嵌套对象而不是扁平 `marginTop` 等字段：语义与页面 `margins` 一致，属性面板和 JSON 都更直观。
- `margins` 缺失、非对象、负数、`NaN` 一律归一化为 0；UI 已限制非负，归一化是加载旧数据和异常 JSON 的兜底。
- 不升级 `project.version`：新字段是可选加法，旧代码读取新文件时只是忽略它；新代码读取旧文件时归一化为 0。

### 2. 表格几何：左右边距内缩，宽度保底并留在块内

`layoutCategory` 中每张表计算：

```js
const MIN_TABLE_WIDTH = 40;
const margins = model.normalizeMargins(table.margins);
const left = model.clamp(margins.left, 0, element.width);
const right = model.clamp(margins.right, 0, element.width);
const tableWidth = Math.max(MIN_TABLE_WIDTH, element.width - left - right);
const tableX = Math.min(left, Math.max(0, element.width - tableWidth));
```

- `tableWidth` 用 `element.width` 而不是标题内容宽：这样 `margins = 0` 时与现状完全一致（表格满块宽）。
- `tableX` 在极端边距下把表格推回块内；当 `left + right` 已经放不下 40px 时，优先保证最小宽度和块内包含，实际视觉左边距会小于输入值。这是有意的降级，输入值本身不被静默改写。
- 每张表的 `tableWidth` 可能不同，必须写进该表的布局结果（`assigned.tableWidth`、`assigned.x`），不能继续用布局级的 `computed.tableX` / `computed.tableWidth`。
- 标题区域只用 `BLOCK_PADDING`，不受表格边距影响；边距只作用于表格，符合“各表格独立”。

### 3. 纵向：边距相加，块高含末表下边距

```js
let tableY = BLOCK_PADDING + titleHeight + TITLE_GAP;
element.tables.forEach(function (table) {
  const margins = model.normalizeMargins(table.margins);
  tableY += margins.top;
  const assigned = assignTableSongs(...);
  assigned.y = tableY;
  tableY += assigned.height;
  tableY += margins.bottom;
});
const blockHeight = tableY + (hasTableRows ? 0 : BLOCK_PADDING);
```

- 表间空白 = 上表下边距 + 下表上边距，**不做 margin collapse**。理由：四边距是每张表独立可编辑的属性，相加的结果可预测；折叠会让某张表的边距“消失”，与“各表格独立”冲突。
- 末表下边距计入 `blockHeight`，所以它既形成块内底部留白，也影响拖入新分类块时的堆叠基准和页面溢出警告。若不想要底部空白，用户把下边距设为 0。
- `margins = 0` 时：首表位置、表间零间距、块高公式都与现状一致；无行时保留原有 `BLOCK_PADDING` 底部收尾。

### 4. 绘制与交互：全部改为使用每表几何

`js/layout.js` 返回的每张表增加 `x`、`tableWidth`，`assignTableSongs` 仍只负责表内列宽/单元格；表格级 `y` 和高度由 `layoutCategory` 叠加。

`js/render.js`：

- 红格 `element.x + table.x`；
- 单元格 `cellX = element.x + table.x + cell.x`；
- 表格边框和行线用 `table.tableWidth`；
- 列分隔线从 `element.x + table.x` 开始累加 `table.widths`；
- 外层分类块边框仍用 `element.x/element.width/blockHeight`。

`js/app.js` 的 `renderer.tableDividers` 改为返回 `x: element.x + table.x + Σwidths`、`y: element.y + table.y`；拖拽逻辑本身（`startWidths`、`MIN_COL_WIDTH`、`setManualWidths`）不变。

**取舍**：保留布局级 `tableX`/`tableWidth` 作为兼容别名会掩盖漏改；直接移除并让所有调用点改用表级字段，编译期没有保护，但可以用 `grep` 核对（design 的验证任务覆盖）。

### 5. 手动列宽与块宽缩放

`assignTableSongs` 已经把 `table.widths` 通过 `fitWidths(table.widths, tableWidth)` 归一到传入宽度；传入值从块宽改为扣除边距后的 `W` 即可。`scaleManualWidths` 仍按块宽变化比例缩放固定列宽，随后由 `fitWidths` 归一到新的 `W`；边距保持不变，不参与缩放。

### 6. 属性面板：表格卡片内 2×2 紧凑输入

`js/ui.js` 的 `tableCard` 增加一行“边距”，内部 2×2 排列四个数字输入：

- 上 / 右
- 下 / 左

每个输入带 `data-table-field="margin-top|margin-right|margin-bottom|margin-left"`、`min="0"`、`step="1"`、单位 `px`。使用现有 `numberInput` 和 `field` 的视觉语言，新增 `.table-margin-grid`（两列 grid、6px 间距、10px 标签）保证 58px 标签列下不撑破面板。

事件绑定：

```js
if (fieldName.indexOf('margin-') === 0) {
  const side = fieldName.slice('margin-'.length);
  table.margins = model.normalizeMargins(table.margins);
  table.margins[side] = Math.max(0, Number(input.value) || 0);
  L.app.changed({ property: false });
}
```

- 不调用 `ui.renderPropertyPanel()`，避免输入时丢焦点；画布通过 `changed` 立即重排。
- `margins` 在绑定前归一化，兼容内存中没有该字段的旧项目。
- 提示文案说明“边距相对分类块边缘，单位为 px；上下边距相加”。

### 7. 新增/自动续表复制边距

两处创建表格的代码都改为复制：

- `layout.normalizeTables` 在尾部追加动态表时，复制 `last.margins` 的副本；
- `layout.addTable` 在用户新增表格时，复制 `previous.margins` 的副本。

必须深拷贝对象，避免多张表共享同一个 `margins` 引用后改一张影响全部。

### 8. 保存/加载与校验

`js/io.js`：

- `serializeTable` 输出 `margins: model.normalizeMargins(table.margins)`；
- 加载映射时 `margins: model.normalizeMargins(table.margins)`；
- 校验阶段接受缺失 `margins`（旧文件），若存在则要求对象且四项均为有限非负数；不要求四项都存在，缺失项按 0 处理。

不修改 `version`；保存出的新文件带 `margins`，旧版本应用读取时会忽略该字段，不会报错。

### 9. `devChecks` 覆盖

在现有 `check(...)` 框架内增加：

- 默认 `margins = {0,0,0,0}`：表格 `x = 0`、`tableWidth = element.width`、首表 `y` 与旧公式一致。
- 左 40 / 右 60 / 块宽 600：`tableWidth = 500`、`x = 40`、最后一列右边缘 = 540。
- 表 1 下 20 + 表 2 上 30：两表间距 50。
- 首表上 24：首表 `y` 增加 24。
- 末表下 32：`blockHeight` 增加 32。
- 左右边距过大：`tableWidth >= 40` 且表格不超出块右边缘。
- 新增表/自动续表复制边距且两个对象不共享引用。
- `normalizeMargins` 对 `undefined`、负数、`NaN` 返回 0。

## Risks / Trade-offs

- **上下边距相加会让相邻表间距翻倍** → 在属性面板提示“上/下边距相加”，并在 spec 场景里固定该行为；若后续想要单一边距，再单独提需求。
- **末表下边距改变块高** → 这是让边距影响后续堆叠/溢出的唯一一致做法；用户可通过设为 0 恢复紧凑底部。
- **极端边距下视觉边距小于输入值** → 优先保证 40px 最小宽度和块内包含；输入值保留，缩小块宽后表格自动回到块内，不会产生负宽度或 NaN。
- **每表宽度不同** → 必须移除对布局级 `tableX/tableWidth` 的依赖。落地后全仓 `grep tableX|tableWidth` 核对 `render.js`、`app.js`、`devChecks`，避免漏改导致边框/拖拽错位。
- **旧项目/异常 JSON** → 统一走 `normalizeMargins`，缺失或非法值按 0；校验不因旧文件缺字段而拒绝加载。
- **输入框失焦** → 边距修改不重渲染属性面板，只触发画布重排，避免连续输入时焦点丢失。

## Migration Plan

1. 先加模型默认值与归一化，旧项目加载即得到全 0 边距。
2. 改布局和渲染，确认 `margins = 0` 时所有现有 `devChecks` 与视觉不变。
3. 加属性面板输入和持久化。
4. 手动验证旧项目（无 `margins`）加载、保存、再加载。
5. 回滚只需移除字段和 UI；旧版本读取带 `margins` 的文件会忽略该字段，不阻塞打开。
