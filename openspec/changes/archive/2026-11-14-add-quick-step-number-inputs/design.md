# Design

## Context

属性检查栏（`#property-panel`）的数值框由 `js/ui.js` 的 `numberInput(id, value, min, max, step, disabled)` 与 `marginCross(margins, idPrefix)` 生成，每个框已带 `min`/`max`/`step` 属性与各自的值提交处理函数（写模型 + `L.app.changed()`）。面板随选择/属性变化**重渲染**，逐框 `bind` 的监听器需随渲染重挂；挂在面板上的事件委托则一次挂载即可跨重渲染存活。

现有交互约束（已核实）：

- 现有快捷键只用了画布 `Ctrl`/`⌘`+滚轮（`event.ctrlKey || event.metaKey`，`app.js` `onCanvasWheel`）与文本域内的 `Ctrl` 组合；**无 `Ctrl`+↑/↓ 冲突**。
- 数值框的值提交处理函数**混用**两种事件：页面宽高/边距、背景图 x/y/宽高/旋转走 `change`；元素/文本/图片的 x/y/宽高、字号、行距走 `input`。
- 原生 `type=number` 步进一次只改 `step`（多为 1），角度调 90°/180° 需多次；原生上下步进箭头属浏览器内部 UI，跨浏览器难以用 `preventDefault` 可靠拦截。

## Goals / Non-Goals

**Goals：**

- 大跨度框（旋转角度、边距、宽高、坐标）在聚焦时按住 `Ctrl`（macOS 亦接受 `⌘`）按 ↑/↓，按大步进增减：角度 45、其余 10；按住方向键可连续步进。
- 步进后取值遵循该框 `min`/`max`（旋转角度另按现有归一化），并复用该框既有提交路径写模型、重绘。
- 零新增 DOM 元素、零样式改动；未标记框行为完全不变。

**Non-Goals：**

- 不实现「鼠标点原生步进箭头 + Ctrl」的大步进（用户已选择仅键盘方案）。
- 不改动数据模型、持久化、渲染结果或导出。
- 不给表格行列数、字号、行距、阴影/描边、表格内边距、导出对话框宽高加大步进。
- 不引入自动连步定时器（连续步进依赖浏览器键盘自动重复）。

## Decisions

**D1 · 触发方式 = 仅键盘 `Ctrl`(⌘)+↑/↓。**
用户已确认。键盘 `keydown` 100% 可拦截；而原生 number 步进箭头在 Chrome 等浏览器中 `mousedown`/`pointerdown` 的 `preventDefault` 未必能阻止内部步进，跨浏览器不稳。
备选（被否）：(a) 保留原生箭头并拦截——跨浏览器不可靠；(b) 每框加一对小自定义箭头按钮——可靠但每个框多 2 个元素，违背"少加元素"的诉求。

**D2 · 启用方式 = 目标框加 `data-ctrl-step="<N>"` 属性，未标记则不启用。**
声明式、按框配置，避免在处理器里硬编码 id 白名单；新增框只需在生成时传入该参数。
落地：`numberInput()` 增加可选第 7 参 `ctrlStep`，存在时输出 `data-ctrl-step`；`marginCross()` 的 `item()` 直接输出 `data-ctrl-step="10"`。
备选（被否）：监听器内维护 id 白名单——与重渲染、动态前缀 id（表格）耦合，易漏易错。

**D3 · 单点事件委托挂在 `#property-panel` 的 `keydown`。**
面板重渲染会重建输入框；委托一次挂载即跨重渲染存活，且 `event.target` 即聚焦输入框，用 `target.matches('input[type=number][data-ctrl-step]')` 判定即可。
触发条件：`(event.ctrlKey || event.metaKey) && (key === 'ArrowUp' || key === 'ArrowDown')` 且 target 命中 → `event.preventDefault()` 后执行步进。

**D4 · 步进计算与提交。**
- 从 `target` 读取 `min`、`max`、`data-ctrl-step`（缺失则回退其 `step`），`dir = ArrowUp ? +1 : -1`。
- `next = clamp(round(current + dir * big), min, max)`；这些框 `step=1`（整数），按整数取整（未来若出现小数步进阶，按该阶 `step` 精度取整）。
- 写值后按序派发 `new Event('input', {bubbles:true})` 与 `new Event('change', {bubbles:true})`。
  - **关键**：现有提交函数混用 `change` 与 `input`，必须两种都派发才能覆盖全部框，命中哪种由各自 handler 决定；`change` 会触发各框既有逻辑（旋转走 `normalizeAngle`、写模型、`L.app.changed()` 重绘），不新增提交路径。
- `clamp` 到该框 `min`/`max`，使顶到边界后继续按不再增长（与该框输入越界的现有体验一致）。

**D5 · 字段映射（谁打标、标多少）：**

| 步进值 | 输入框 |
| --- | --- |
| 45（角度） | `prop-bg-rotation`、`prop-img-rotation` |
| 10（宽高/坐标） | `prop-page-w`、`prop-page-h`、`prop-bg-x/y/w/h`、`prop-el-x/y/w`、`prop-text-x/y/w`、`prop-img-x/y/w/h` |
| 10（页面边距） | `prop-margin-top/left/right/bottom`（`marginCross`） |

不打标（保持原生 `step=1`）：表格 `columns`/`rows`、字号 `*-size`、行距 `*-lineheight`、阴影 `shadow-blur/x/y`、描边 `outline-width`、表格内边距 `margin-*`、导出对话框 `export-width/height`。

## Risks / Trade-offs

- [无鼠标路径] → 用户已确认取舍；如需鼠标可后续追加小自定义箭头，不影响本方案。
- [依赖浏览器键盘自动重复] → 连续步进节奏由 OS 决定，不可自定义；与目标一致，且避免引入定时器复杂度。
- [派发 `input`+`change` 触发一次渲染] → 大步进为离散步进、频率受键重复限制，无性能问题。
- [角度边界归一化] → `prop-img-rotation` 顶到边界后由既有 `normalizeAngle` 归一（如 −180→180），与直接输入越界的现有行为一致，非新逻辑。
- [`min`/`max` 取自 DOM 属性] → 现各框 `min`/`max` 均为静态，渲染时属性正确，无风险。

## Migration Plan

纯增量：无数据迁移、无 schema 变更、`build.sh` 不变。改动集中于 `js/ui.js`——① `numberInput`/`marginCross` 输出 `data-ctrl-step`；② `#property-panel` 挂 `keydown` 委托 + 一个步进函数。回滚即还原这两处。

## Open Questions

- **表格内边距是否也要 `Ctrl` 大步进？** 当前按"小数值不加"原则未打标（spec 已将其列入"不受影响"）。如需要，给 `tableCard` 的 `marginInput` 加 `data-ctrl-step="10"` 即可（约 1 行），但需同步微调 spec 的"作用范围"列举。默认不改，可延后确认。
