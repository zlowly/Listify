# Design

## Context

`js/layout.js` 的 `assignTableSongs` 当前流程：

1. 按列优先/行优先把排序后的歌名放进 `cells`；
2. 逐列测量最长歌名，得到 `rawWidths`；
3. 自动和手动都调用 `fitWidths(rawWidths, tableWidth)`；
4. 把 `colWidths` 写进 `cell.width/x`，`innerWidth = cell.width - 2 * CELL_PAD_X`，`overflow` 和 `justifySpacing` 都基于这个 `innerWidth`。

`fitWidths` 的权重是 `rawWidth - MIN_COL_WIDTH`，它分配的是“列与最小列宽的差”的比例，不是内容本身的比例。升序排序 + 列优先填充让最后一列通常最长，最后一列因此得到最多剩余宽度；左对齐时这些剩余宽度留在最后一列右侧。`js/render.js` 的对齐、两端对齐、裁剪、红格和分隔线都直接使用 `cell.width`，所以“格子宽”和“内容宽”目前是同一个值。

## Goals / Non-Goals

**Goals:**

- 自动列宽把 `W - Σa` 全部变成 `n-1` 个等距间隙。
- 最后一列不再获得额外宽度，右边缘贴齐表格。
- 对齐、两端对齐、裁剪和溢出检测只使用内容宽 `a_i`，不被 `g` 污染。
- 手动拖动、块宽缩放、列数重置、恢复自动的行为保持不变。
- 单列、`Σa > W`、`g = 0`、空表、浮点误差都有确定行为。

**Non-Goals:**

- 不封顶 `g`。
- 不改排序、填充、动态行、自动续表。
- 不改导出格式或编辑辅助线是否导出。
- 不引入拖拽吸附或列间距单独编辑。

## Decisions

### 1. 自动列宽使用独立函数，`fitWidths` 继续服务手动和 fallback

新增 `autoGapWidths(rawWidths, totalWidth)`，返回 `{ widths, contentWidths, gap, fallback }`：

```js
function autoGapWidths(rawWidths, totalWidth) {
  const n = rawWidths.length;
  const total = Math.max(1, totalWidth);
  if (!n) return { widths: [], contentWidths: [], gap: 0, fallback: false };
  if (n === 1) return { widths: [total], contentWidths: [total], gap: 0, fallback: false };

  const sum = rawWidths.reduce(function (a, b) { return a + b; }, 0);
  const gap = (total - sum) / (n - 1);

  if (gap < 0) {
    const widths = fitWidths(rawWidths, total);
    return { widths: widths, contentWidths: widths.slice(), gap: 0, fallback: true };
  }

  const widths = [];
  let used = 0;
  for (let i = 0; i < n - 1; i += 1) {
    widths.push(rawWidths[i] + gap);
    used += widths[i];
  }
  widths.push(total - used); // 最后一列 = a_n，吸收浮点误差
  return { widths: widths, contentWidths: rawWidths.slice(), gap: gap, fallback: false };
}
```

- `n === 1`：没有 `n-1` 个间隙，单列直接占满表格；`contentWidths` 也用 `total`，让对齐在整列内进行。
- `gap < 0`：没有空间放间隙，退回 `fitWidths`；`contentWidths` 等于压缩后的列宽，因此红格/裁剪行为和现在一致。
- `gap === 0`：`widths` 等于 `rawWidths`，最后一列也是 `a_n`；不需要特殊分支。
- 最后一列用 `total - Σ(widths[0..n-2])` 计算，保证 `Σwidths === total`，避免 `g` 的浮点误差累积到右边缘。
- `contentWidths` 始终是 `a_i`（fallback 时是压缩列宽），`widths` 是包含间隙的渲染列宽。

`fitWidths` 保留：

- 手动模式：`fitWidths(table.widths, tableWidth)`，把用户拖出来的固定列宽归一到表格宽度。
- fallback：`Σa > W` 时复用现有压缩算法。
- 空表：见决策 4。

### 2. `contentWidth` 是文本盒，`width` 是渲染盒

`assignTableSongs` 中：

```js
const auto = useManual
  ? null
  : (take === 0
      ? { widths: fitWidths(rawWidths, tableWidth), contentWidths: null, gap: 0, fallback: false }
      : autoGapWidths(rawWidths, tableWidth));

const colWidths = useManual
  ? fitWidths(table.widths.map(Number), tableWidth)
  : auto.widths;
const contentWidths = useManual
  ? colWidths
  : (auto.contentWidths || auto.widths);

// ...
cell.width = colWidths[cell.col];
cell.contentWidth = contentWidths[cell.col];
cell.innerWidth = Math.max(0, cell.contentWidth - CELL_PAD_X * 2);
cell.textWidth = measureText(cell.text, songStyle);
cell.overflow = cell.textWidth + SAFETY > cell.innerWidth;
cell.justifySpacing = table.align === 'justify' && charCount > 1
  ? Math.max(0, (cell.innerWidth - cell.textWidth) / (charCount - 1))
  : 0;
```

- `cell.x` 继续按 `colWidths` 累加；分隔线、手动快照、`table.widths` 都用渲染盒。
- `cell.width` 继续表示渲染盒，用于分隔线位置和手动拖动快照。
- `cell.contentWidth` 表示文本盒；`innerWidth`、对齐、两端对齐、裁剪和红格都用它。
- 自动模式下 `cell.width - cell.contentWidth` 在前 `n-1` 列等于 `g`，最后一列约等于 0（浮点误差内）。
- 手动模式 `contentWidths = colWidths`，`g = 0`，行为与现在一致。

`js/render.js` 的改动：

- 红格：`ctx.fillRect(..., cell.contentWidth, cell.height)`，只覆盖内容盒。
- 裁剪：`ctx.rect(cellX, cellY, cell.contentWidth, cell.height)`，不让溢出文字进入列间距。
- 对齐/两端对齐：`innerWidth = cell.contentWidth - 2 * cellPadX`，保持现有公式。
- 分隔线：继续用 `table.widths` 累加；分隔线会落在下一列内容盒的起点，间隙在分隔线左侧。这是编辑态辅助线，导出不画表格线，不影响成品。

### 3. 手动拖动冻结渲染列宽

`js/app.js` 的 `dividerDrag` 从 `drag.startWidths` 开始，`startWidths` 来自 `table.widths`。自动模式下 `table.widths` 已经包含 `g`，所以第一次拖动会把“当前渲染列宽（含间隙）”冻结为固定列宽：

- `table.widthMode = 'manual'`；
- `table.widths = 当前含间隙的列宽`；
- 重新布局时 `contentWidths = colWidths`，自动 `g` 规则不再生效。

这与“拖完即固定列宽、自动间距消失”的确认一致：间隙不再是自动计算的等距 gutter，而是被吸收进固定列宽。之后块宽变化走 `scaleManualWidths` 按比例缩放；修改列数调 `setColumns` 重置为自动；恢复自动调 `resetAuto`。

**取舍**：如果拖动后仍保留独立的 `contentWidth`，手动模式也能保留“文本盒 + gutter”的语义，但会引入“手动间距”这一新概念，且拖动分隔线时无法直观看到间隙归属。当前需求明确保持现状，因此采用冻结渲染列宽的方案。

### 4. 边界情况

- **单列 `n = 1`**：`widths = [W]`，`contentWidths = [W]`，`gap = 0`。没有 `n-1` 个间隙，单列占满表格；左对齐时尾部空白 = `W - textWidth - padding`，这是单列特例，不参与等距规则。
- **`Σa > W`**：`gap < 0`，走 fallback；`widths = fitWidths(rawWidths, W)`，`contentWidths = widths`，`gap = 0`，`fallback = true`。红格警告沿用现有逻辑。
- **`Σa === W`**：`gap = 0`，不特殊处理；`widths = rawWidths`，最后一列 `a_n`，总宽刚好。
- **空表（`take === 0`）**：没有歌名可测，`rawWidths` 全是 `MIN_COL_WIDTH`；直接套公式会产生无意义的巨大 `g`。空表退回 `fitWidths`，`contentWidths = widths`，`gap = 0`。表里没有歌名，用户看不到间距语义差异；分隔线保持常规布局。
- **有歌名但某些列空**：空列 `a_i = MIN_COL_WIDTH`，按正常规则参与 `g`；空列会得到窄内容盒和同样的间隙，不特殊处理。
- **字体/字号变化**：`rawWidths` 每次 `layoutCategory` 重新测量，`g` 随之变化；不需要缓存。
- **块宽变化**：自动模式重新计算 `g`；手动模式 `scaleManualWidths` 按比例缩放固定列宽。
- **列数变化**：`setColumns` 把 `widthMode` 重置为 `auto`，按新列数重新计算。
- **极端 `g`**：不封顶。2 列、`W=960`、`a=[44.4, 81.8]` 时 `g≈833.8`，首列贴左、末列贴右。是否需要封顶留到后续需求。
- **浮点误差**：`Σwidths` 用最后一列吸收误差；`devChecks` 用 `Math.abs(sum - W) < 0.01`。

### 5. 为什么不把 `g` 并入 cell 宽

字面实现 `cell_i = a_i + g`（`i < n-1`）、`cell_n = a_n`，如果把 `cell` 直接当对齐盒：

- 左对齐：视觉上和独立 gap 一样；
- 居中：前 `n-1` 列的对齐盒多了 `g`，最后一列没有；最后一处间距 ≈ `g/2 + 2p + safety/2`，比其它间距小；
- 右对齐：最后一处间距 ≈ `2p + safety`，几乎贴在一起；
- 两端对齐：前 `n-1` 列把 `g` 拉伸进文字，最后一列不拉伸，最后一处间距只剩 `2p`。

演示原型在 600px / 3 列 / 居中的例子里量到：独立 gap 的间距是 `111.3 / 111.3`；字面实现的最后一处是 `64.6`。因此采用“渲染盒含 gap、文本盒为 a_i”的模型。这是本 change 的核心设计点。

## Risks / Trade-offs

- **分隔线位置**：自动模式下分隔线在下一列内容盒起点，间隙在分隔线左侧，看起来会靠近下一列文字。表格线只在编辑态显示，导出无表格线；如果后续觉得别扭，可以把分隔线画在间隙中点，但那会改变拖拽命中区域，留到后续。
- **手动快照包含间隙**：从自动切手动后，原来的 `g` 被吸收进固定列宽；居中/右对齐时文字会在固定列宽内重新分布，视觉上不再保持原来的等距 gutter。这是“冻结当前列宽”的直接结果。
- **空表 fallback**：空表不遵循 `a_i + g` 公式，但没有歌名，属于退化情况；在设计里显式记录，避免以后误以为是漏实现。
- **测量依赖字体**：`a_i` 是浏览器实测值，不同机器/字体回退会有差异；同一台机器上布局可复现。现有实现已经如此。
- **不封顶 `g`**：极端歌单会出现大片空白；用户已确认 v1 先接受。

## Verification

- `Listify.layout.devChecks()` 增加：
  - `autoGapWidths([100, 150, 200], 600)` → `gap=75`、`widths=[175, 225, 200]`、`contentWidths=[100, 150, 200]`、`Σwidths=600`。
  - `autoGapWidths([100, 150, 200], 300)` → `fallback=true`、`gap=0`、`widths` 与 `fitWidths` 一致、`contentWidths=widths`。
  - `autoGapWidths([100], 600)` → `widths=[600]`、`contentWidths=[600]`、`gap=0`。
  - `autoGapWidths([100, 200], 300)` → `gap=0`、`widths=[100, 200]`。
  - 真实布局：3 列、`take>0`，检查前 `n-1` 列 `width - contentWidth` 相等，最后一列差 ≈ 0。
  - 真实布局：`cell.innerWidth === cell.contentWidth - 2 * CELL_PAD_X`；居中/右对齐时 `cell.x` 和 `cell.contentWidth` 的组合保持等距。
  - 手动模式：`widthMode='manual'` 后 `contentWidths === widths`、`gap=0`；从自动快照的宽度在手动模式中保持。
  - 空表：`take=0` 时 `gap=0`、`Σwidths=W`。
- 浏览器手动验证：
  - 导入中英混合歌单，默认自动；最后一列贴右，前 `n-1` 列间隙相等。
  - 切居中/右对齐/两端对齐，间隙不塌。
  - 3 列 ↔ 5 列、块宽拖动、恢复自动。
  - 手动拖动分隔线，固定列宽；再拖块宽，列宽按比例缩放。
  - 缩窄表格触发 `Σa > W`，红格和 fallback。
  - 单列、空固定表。
  - `file://` 打开，无控制台错误；导出 PNG 无表格线/红格。
