# Design

## Context

见 `proposal.md` 与 `specs/`。当前的实现事实决定了做法：

- 图层面板由 `js/ui.js` 的 `renderLayerPanel` 每次整块重建 `innerHTML`，行点击/按钮事件按渲染结果重新绑定；这是既有模式，新增拖拽应沿用，不引入持久化 DOM 或虚拟列表。
- 内容行已有一对箭头按钮，背景图片子行没有；背景图的换序动作 `L.app.moveBackgroundImage(setId, imageId, ±1)` 已存在（`js/app-backgrounds.js`），但没有撤销，且属性面板是唯一入口。
- 拖拽已有家规：歌单编辑器用原生 HTML5 拖放 + 模块级 `dragPayload` + 一个类名切换做反馈（`js/ui-playlist-editor.js`）；分类行已是 `<button draggable="true">`（审计 M-8）。本设计复用同一套，不自绘拖影、不引依赖。
- 图层行目前是 `div`，内部嵌着箭头与 `＋` 按钮，因此不能整体改成 `<button>`（按钮不能嵌按钮）。这正是 `editor-shell`“图层行 SHALL 使用原生可聚焦控件”长期未落地原因。
- 面板显示顺序与模型数组顺序相反（上=前）。草稿持久化不需要新增钩子：`ui.renderAll` → `redraw` 的 `dirty.draft` 会排队保存。

## Goals / Non-Goals

**Goals**

- 背景图片与内容元素在“同为兄弟层”这件事上拥有同一套换序入口与同一套撤销语义。
- 图层行同时满足“原生可聚焦”和“可拖拽”，且不改变现有行高、内边距、字号、悬停与选中样式。
- 重排逻辑可被 `node --test` 覆盖，不依赖 DOM。

**Non-Goals**

- 拖拽时面板自动滚动（长列表靠按钮）。
- 图层行缩略图、把“图片 N”改成素材文件名（识别性问题独立处理）。
- 跨页面、跨背景集搬家（内容行不能移出当前页，背景图不能换集）。
- 触屏拖拽（HTML5 拖放在触屏不触发，按钮即触屏路径）。
- 多选拖动、整段框选。

## Decisions

### 1. 行的结构：外框 + 主按钮 + 兄弟动作按钮

```
<div class="layer-row" data-layer-kind="element|bgImage|bgSet">
  <button class="layer-row-main" draggable="true">   <- 焦点/Enter/拖拽起点
     <span class="layer-icon">…</span><span class="layer-name">…</span>
  </button>
  <span class="row-actions">
     <button aria-label="下移一层">↓</button><button aria-label="上移一层">↑</button>
  </span>
</div>
```

外框只保留边框、内边距、悬停与选中，主按钮重置为透明的 flex 容器（`flex:1;min-width:0;border:0;background:none;padding:0;font:inherit;color:inherit;text-align:left`）。**替代方案**：整体 `<button>`（非法嵌套，否决）、保留 `div` 只加 `draggable`（改动最小，但拖拽容器仍不可聚焦，语义债继续留着）。这个结构还有个副产物：拖拽起点天然是主按钮，箭头按钮是兄弟节点，不需要“从按钮上起拖”的 `closest('button')` 守卫。

### 2. 拖拽机制：原生 HTML5 DnD + 模块级 payload

沿用歌单编辑器：`dragstart` 写入 `{ kind:'element'|'bgImage', id, setId }` 到模块变量与 `dataTransfer`，`dragover` 切指示线，`drop` 落位。**替代方案**：Pointer Events 自绘拖拽——能支持触屏，但要自己处理滚动容器、拖影、阈值与点击冲突，且与现有家规不一致；零依赖约束排除了第三方库。因此接受“拖拽仅鼠标/笔”，按钮承担触屏与键盘。

### 3. 落点反馈：插入线，不是目标行高亮

按指针在目标行上下半区切换 `drop-before` / `drop-after`，用两条 `box-shadow` 画 4px 蓝线。歌单编辑器的 `.drop-target` 高亮是“移动到另一个分类”的语义，用在顺序调整上无法区分插在上面还是下面，尤其相邻两行必须能分辨。

### 4. 两条独立列表，背景集行是分界线

内容行与背景图片子行分属 `page.elements` 与 `set.images`，`kind` 不匹配一律拒绝：不显示插入线、`dropEffect='none'`、不落位。背景集行不是落点。这条不只是体验问题——`background-layer` 规定背景层 MUST NOT 进入内容 z-order，允许“看起来能落”就是在邀请误操作。

### 5. 重排算法：按显示顺序的 id 列表回写

`model` 新增纯函数，例如 `reorderById(list, id, beforeId)` / `moveWithinDisplayOrder(displayIds)`：从 DOM 取显示序 id → splice → 反向写回模型数组。**明确禁止** `modelIndex = len - 1 - displayIndex` 这类算术换算，那是本功能最可能的 off-by-one 来源。插入位置用“插在哪一行的上方/下方”表达，不用裸下标。

### 6. 撤销：落位前快照，一次操作一条记录

- 按钮路径：`moveBackgroundImage` / `moveLayer` 在改数组前 `pushUndo`。
- 拖拽路径：只在 `drop` 成功且目标位置与当前位置不同时 `pushUndo`，随后重排；落回原位、跨列表被拒、背景集行被拒都不压栈。
- `performUndo` 的选区恢复从“只认 `element`”扩到 `backgroundSet` / `backgroundImage`：快照包含这些 id，恢复后按 id 重新命中，失效则退回 `page`。否则撤销一次背景换序会把属性面板打回页面属性，等于把这次功能的一半体验抵消掉。
- **替代方案**：在 `dragstart` 压栈——中途取消会污染撤销栈，否决。

### 7. 触屏与键盘：按钮是唯一保证路径

HTML5 拖放在触屏不触发，这是平台事实而非实现缺陷。背景图片子行补齐箭头后，两类列表的键盘/触屏换序路径一致：Tab 到行主控件（选中）、Tab 到箭头（移动）。副作用是图层行都会成为 Tab 停点，长列表 Tab 距离变长；这是规格“行 SHALL 使用原生可聚焦控件”的必然代价，不做 roving tabindex（`editor-shell` 已禁止新增方向键漫游/roving 模式）。

### 8. 样式几何不变的实现要点

- `.layer-row` 保留原有边框/圆角/内边距/margin/悬停/选中，主按钮不设自己的高度，靠内容撑开。行高由内容决定：内容行与背景集行本就含 28px 的 `.icon-btn`，高度为 46px；背景图片子行新增两个箭头后从 40px 长到 46px，与其余行统一（已确认接受，不把箭头压回 22px）。
- 窄屏（`--sidebar-w: 280px`）下，背景图片子行缩进 18px 后再放两个 22px 按钮，名称区仍有约 120px，靠 `text-overflow: ellipsis` 截断，不换行、不撑高。
- 拖拽光标：主按钮 `cursor: grab`，拖拽中 `grabbing`；动作按钮保持 `pointer`。

### 9. 数据与持久化

无 schema 变化、无新存储键。数组顺序本来就在草稿与项目 JSON 里，落位后 `ui.renderAll()` 即可，`redraw` 的 `dirty.draft` 负责排队保存。

## Risks / Trade-offs

- **[显示序反转导致下标错位]** → 只做 id 级重排并回写，纯函数由 `node --test` 覆盖“拖到首/尾/原位/相邻/单元素/空列表/反转映射”。
- **[拖拽在触屏与部分环境不可用]** → 箭头按钮是保证路径；拖拽文案不宣称“可拖动到触屏”。
- **[行内点击区域变化]** → 主按钮占满名称区，动作按钮区域不再触发行选中；需确认“点击行右侧空白不选中”是否可接受（既有内容行已是此行为，保持一致）。
- **[撤销恢复选区引入新分支]** → 只在快照内存在对应 id 时才恢复，其余退回 `page`；撤销内容元素的行为不变。
- **[全局背景状态下换序影响所有页]** → 表面已显示“全局”标记，不额外确认；`background-layer` 已把该行为写进规格。
- **[每次重排整块重绘列表]** → 与现状一致，图层行数量有限；不引入局部 patch 以免两套渲染路径。
- **[拖拽与行内滚动冲突]** → 面板可滚动但无自动滚动；极端长列表下拖拽体验受限，按钮兜底。

## Migration Plan

无数据迁移：顺序字段已存在，旧项目与草稿直接可用。回滚即回退代码；`model` 新增函数与 UI 入口互不依赖存储。

## Open Questions

- 是否需要在首次拖拽时给一次性子提示（“也可以点箭头换序”）：可后续按实际反馈决定，不影响规格与任务拆分。
- 拖拽自动滚动、图层缩略图与素材名显示：分别留作独立变更，不改变本设计。
