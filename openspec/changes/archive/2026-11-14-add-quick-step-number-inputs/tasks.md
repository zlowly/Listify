# Tasks

## 1. 为大跨度数值框打标（`data-ctrl-step`）

- [x] 1.1 给 `js/ui.js` 的 `numberInput(id, value, min, max, step, disabled)` 增加可选第 7 参 `ctrlStep`，存在时输出 `data-ctrl-step="<N>"`；并在调用点传值：`prop-bg-rotation`、`prop-img-rotation` = 45；`prop-page-w/h`、`prop-bg-x/y/w/h`、`prop-el-x/y/w`、`prop-text-x/y/w`、`prop-img-x/y/w/h` = 10。验证：浏览器 DevTools 检查上述框的 DOM 带正确 `data-ctrl-step`，未列出的框（字号/行距/行列数/阴影/描边等）不带该属性。
- [x] 1.2 给 `js/ui.js` 的 `marginCross()` 中 `item()` 生成的输入框输出 `data-ctrl-step="10"`（页面边距）。验证：`prop-margin-top/left/right/bottom` 带该属性；`tableCard` 的 `marginInput`（表格内边距）不带。

## 2. 面板级 Ctrl 快速步进

- [x] 2.1 在 `#property-panel` 上挂一个 `keydown` 事件委托（一次挂载、跨重渲染存活）：当 `event.target` 匹配 `input[type=number][data-ctrl-step]` 且 `(event.ctrlKey || event.metaKey)` 且 `key` 为 `ArrowUp`/`ArrowDown` 时，`event.preventDefault()` 并调用步进函数。验证：聚焦任一标记框、按住 Ctrl 按 ↑/↓，值按大步进变化；聚焦未标记框、或未按 Ctrl 按 ↑/↓ 时，走原生 step=1 行为。
- [x] 2.2 实现步进函数：从 `target` 读取 `min`、`max`、`data-ctrl-step`（缺失回退其 `step`），按 `dir` 计算 `next = clamp(round(current + dir*big), min, max)`，设 `target.value = next` 后按序派发 `new Event('input', {bubbles:true})` 与 `new Event('change', {bubbles:true})`。验证：元素旋转框 Ctrl+↓ 从 0° → -45° 且画布重绘；背景图旋转框到 360° 上限后不再增长；宽高/坐标/边距框按 ±10 变化并写模型。

## 3. 集成验证（浏览器手动）

- [x] 3.1 逐项核对 spec 场景：角度（元素 + 背景图）步 45 与边界、宽高/坐标/边距步 10、按住方向键连续步进、未标记框（字号 12→13、行距、表格行列数、阴影/描边、表格内边距、导出宽高）行为不变、不按 Ctrl 时各标记框仍 step=1、属性面板无新增可交互元素且原生箭头仍在。验证：`agent-browser` 打开 `index.html` 逐条观察，结果与 `specs/editor-shell/spec.md` 场景一致。

## Workflow follow-up

- 实现并通过上述验证后，按项目评审要求归档本变更（`openspec archive`）。
- 归档后核对 `editor-shell` 主 spec 已并入"数值输入快速步进"两条需求。
