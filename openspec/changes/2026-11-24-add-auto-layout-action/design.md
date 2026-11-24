# Design

## Context

- 分类块的歌名子分区是 `element.tables` 数组，每张表有 `columns`/`rows`/`fill`/`align`/`widthMode`/`widths`/`margins`；多张不同列数的表顺序堆叠，天然可以表达“前几行多列、后面少列”的手工排法。
- `L.layout.arrangeTables(element, category, options)` 已实现：按视觉字宽升序排序，在 `maxRows` 与 `maxColumns × density` 约束下用动态规划（≤150 首）或单表近似（>150 首）求分段；返回 `{ rows, minRows, overBudget, simplified, tables }`，`tables` 可直接赋给 `element.tables`。
- 属性面板的表格组已有局部刷新机制：`refreshTableGroup(group, element, category)` 只替换表格组 body 与组头计数，并复用 `capturePanelFocus`/`restorePanelFocus`，满足 `editor-shell`「面板输入就地提交 / 结构变化只更新受影响区域」的约束。
- 确认框统一走 `ui.modal.confirm(title, message, { confirmLabel })`；撤销统一走 `L.app.pushUndo(label)` + 修改模型 + `changed()`。
- 项目序列化是白名单（`project-io.serializeTable` 只取已知字段），运行时挂在 `element` 上的临时字段不会写入项目文件。

## Goals / Non-Goals

**Goals:**

- 为单个分类提供手动“自动布局”入口，参数可调，结果可撤销。
- 复用既有算法层与表格组局部刷新，不改变项目格式、默认表格行为与渲染管线。
- 失败、超预算、简化三种结果都有明确反馈。

**Non-Goals:**

- 不做整页/多分类自动分页或自动重排。
- 不在新增分类块、拖入分类、导入歌单时自动执行。
- 不持久化自动布局参数，不把参数写进项目文件。
- 不改变字体、对齐、表格边距与分类块几何。

## Decisions

1. **入口放在「表格」组 body 顶部，而不是组头**
   组头右侧已被表格数量与帮助提示占用；参数需要两个输入和一个按钮，放 body 顶部更易读，也便于 `refreshTableGroup` 整组重建时一起刷新。
   - 备选：画布右键菜单。否决：项目没有右键菜单基础设施，新增一套交互面超出本变更。

2. **参数只暴露“最多行数”和“密度”，其余用算法默认**
   “最多行数”直接对应分类块的高度预算；“密度”映射到 `maxColumns × density`（100% = 最多 8 列，50% = 最多 4 列），控制列数上限。`lambda`、`maxStep`、`maxColumns` 保持默认，避免面板出现难解释的算法旋钮。
   - 备选：暴露“目标填充率”。否决：单分类必须排完全部歌名，填充率作为输入会与“排完”冲突，且容易制造非预期留白。

3. **默认值：最多行数取“当前块行数与整页容量中的较小者”，密度 100%**
   默认不把块撑得比页面内容区还高；当前块行数可作为用户直观的起点。由面板内纯函数计算，不写入模型。

4. **确认后只替换表格结构，保留字体、对齐与第一个表的边距**
   `arrangeTables` 已经保留首表 `margins` 与 `align` 并写入所有新表；确认文案必须与实现一致，避免“说清除边距但实际保留”的误导。撤销标签为“自动布局”。

5. **参数存 `WeakMap`（element → { maxRows, density }），不持久化**
   `refreshTableGroup` 会重建参数输入；用 WeakMap 以同一 element 引用为键，保证刷新后本次参数不回退。撤销后 element 引用变化，参数回到默认，符合“会话内、可撤销”的定位。
   - 备选：写 `element._autoLayout`。否决：虽然序列化白名单不会写入项目文件，但运行时字段会随 `model.clone` 进入撤销快照，语义上更像持久状态；WeakMap 不污染模型。

6. **失败/超预算/简化的反馈分工**
   - `arrangeTables` 返回 `null`：`ui.modal.alert` 提示“可能存在过长歌名或宽度不足”，不修改模型。
   - `overBudget: true`：仍应用结果，`ui.toast` 提示实际行数与设定行数。
   - `simplified: true`：`ui.toast` 提示已按单表简化排版。

## Risks / Trade-offs

- [大分类简化] → `arrangeTables` 对 >150 首走单表近似，可能比精确 DP 多 1–2 行；UI 明确提示，用户仍可手动拆表。
- [超预算仍应用] → 用户设的行数低于物理最小值时结果会超过设定高度；通过 toast 告知，且可撤销，不静默截断歌名。
- [局部刷新的焦点] → 按钮点击后 `refreshTableGroup` 会替换按钮本身；复用既有焦点恢复逻辑，焦点回到面板，不影响连续输入场景。
- [参数不持久化] → 重新选中或撤销后回到默认值；本变更刻意保持轻量，避免在效果未验证前扩展项目格式。