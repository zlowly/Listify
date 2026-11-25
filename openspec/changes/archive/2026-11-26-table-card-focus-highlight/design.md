# Design

## Context

见 proposal.md 的 Why 与 specs 的需求文本。画布的编辑期装饰已经全部收在 chrome/overlay 两个 canvas 层（`js/app-chrome.js`），它们本身不进导出渲染路径；表格几何已有现成来源：`renderer.tableDividers(project, page, element)` 与 `layout.layoutCategory(..., { editMode: true })` 返回的每表布局。属性面板表格卡片由 `ui-property-panel.js` 的 `tableCard()` 生成，带 `data-table-index`。项目已有选中描边（工坊蓝 `#2563eb` 1.5px 实线）、`drawShapePreview` 的"蓝框 + 8% 蓝底"先例、以及 `drawTableDividers` 的整块分隔虚线。

## Goals / Non-Goals

**Goals:**
- 编辑态常驻的表格序号角标，建立属性卡片 ↔ 画布表格的双向锚定。
- 表格卡片聚焦时画布即时高亮对应表格，焦点离开即消失。
- 全部绘制只进 chrome 层，重绘代价与现有选中描边同级。

**Non-Goals:**
- 不做反向联动（点击画布表格定位/滚动到对应属性卡片）。
- 不为分类名/歌名子分区字段做聚焦联动。
- 不改导出渲染、项目数据结构、持久化格式。

## Decisions

1. **聚焦状态放在 app 级 state，不藏在 chrome 内部。** `js/app.js` 的 state 增加 `focusTableIndex`（默认 `null`）。理由：状态的生命周期跨模块——面板负责写入（focusin），chrome 只读；删表、切换选中、`ui.renderAll()` 重建面板时都需要集中清除。备选：chrome 内部闭包变量。放弃原因：清除时机会散落。
2. **事件委托一次绑定，不逐 input 绑定。** 在「表格」分组容器上用 `focusin`/`focusout` 冒泡委托，从 `event.target.closest('.table-card')` 取 `data-table-index` 写入/清除状态，并 `L.app.changed({ property: false, layers: ['chrome'] })` 触发轻量重绘。`focusout` 用 `relatedTarget` 判断是否仍落在同一卡片内（控件间移动焦点时不清除）。备选：每个 input 上绑 focus/blur。放弃原因：面板因改值会重建，逐个绑定既繁琐又易漏。
3. **高亮画在表格渲染盒上，复用 layout 几何。** `drawSelection`（由 `drawOverlayLayer` 调用，绘制在 `#overlay` canvas 层）内、在 `drawTableDividers` 之后补一段：当选中元素是分类块且 `focusTableIndex` 命中时，从 `layoutCategory` 结果取该表的渲染盒（与 `tableDividers` 同源），画 1.5px `#2563eb` 实线外框 + `rgba(37, 99, 235, 0.08)` 填充——颜色与语义完全沿用 `drawShapePreview` 的既有组合；聚焦状态写入时调度 `['overlay']` 层重绘。备选：虚线框。放弃原因：虚线在项目里表示"参考/溢出"（margin 虚线、溢出红虚线），实线才是"选中/聚焦"信号。
4. **序号角标画在每张表外框左上角，常驻于编辑态。** 角标为约 14px 圆角方块，工坊蓝底白字序号，位置取该表渲染盒左上角（略作外偏避免与块边框重叠）；仅当选中分类块时绘制（与现有 `drawTableDividers` 同一触发条件）。备选：只在 hover 卡片时显示。放弃原因：hover 不覆盖键盘用户，且"认表"是常驻需求而非瞬时需求。
5. **聚焦跟随重排。** 高亮每帧从 layout 结果现算，不缓存旧几何；结构变更触发的重绘（`changed` → chrome 重绘）自然取到新盒。表格删除使 `focusTableIndex` 越界时，绘制前做边界检查并静默不画，同时由绑定逻辑在表格数量变化后校正/清除状态。

## Risks / Trade-offs

- [角标与块内容重叠遮挡文字] → 角标画在 chrome 层（内容层之上）且尺寸小（约 14px），位于表格盒左上角边缘；如遮挡严重可调偏移量，不影响 spec。
- [focusout 时面板因改值重建导致焦点丢失] → 这是既有行为（数值输入改值后重绘保留焦点，见 DESIGN.md 数值定宽条目）；委托逻辑按 `data-table-index` 写状态，重建后状态不丢。
- [淡蓝填充盖在深色歌名上产生色偏观感] → 8% 透明度下视觉影响与现有形状预览一致，可接受；不做反淡出/压暗其它表格（探索时已排除）。

## Migration Plan

纯增量 UI 行为，无数据迁移。回滚即移除对应绘制与绑定代码。

## Open Questions

（无）
