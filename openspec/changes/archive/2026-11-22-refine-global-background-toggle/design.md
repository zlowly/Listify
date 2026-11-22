# Design

## Context

- 页面背景分组由 `js/ui-property-panel.js` 的 `backgroundGroup(page)` 生成。未覆盖页的全局开关当前写作 `field('全局背景', '<label class="check-row"><input id="prop-bg-global" …> 所有页使用此背景</label>')`：`.field` 是 `72px` 标签列 + 控件列的两列网格，所以「全局背景」与复选框被分到两列。
- 被覆盖页当前写作 `field('全局背景', '… 本页接管')`，上方是 `.inline-actions` 中的「取消全局背景」按钮；未覆盖页上方是 `.bg-actions` 两列按钮网格，带 `margin-top: 4px`。
- `.help-tip` 已由 `js/ui-fields.js` 的 `helpTip(text)` 统一生成（`button.help-tip[data-tip]` + `aria-label`），`js/ui.js` 已为属性面板提供悬停/聚焦浮动提示、定位与 Escape 关闭；本次直接复用，不新增提示实现。
- `.check-row` 已是 `display:flex` 的复选框行；`.field` 默认 `margin-bottom: 7px`，`.bg-actions` 与 `.inline-actions` 只有 `margin-top: 4px`，因此按钮与下方全局行之间几乎没有间隔。

## Goals / Non-Goals

**Goals:**

- 未覆盖页的全局开关成为单行：复选框 → 「全局背景」文字 → `?` 帮助按钮；「所有页使用此背景」只存在于 `?` 的浮动提示中。
- 全局开关行与上方动作按钮组之间有明显垂直间距；被覆盖页的「本页接管」行与「取消全局背景」按钮之间也有同样的间距。
- 不改复选框的 `id`、事件绑定、撤销与全局指针语义；复用现有 `helpTip` 与浮层实现。

**Non-Goals:**

- 不改变被覆盖页「本页接管」的文案、控件顺序或可见性。
- 不改 `ui.js` 的浮动提示定位、样式或键盘行为。
- 不改背景数据、项目 schema、草稿持久化、导出与画布命中逻辑。

## Decisions

1. **新增局部行模板，不再用 `field()` 承载未覆盖页的开关。**
   - 输出结构：`<div class="global-bg-row"><label class="check-row"><input id="prop-bg-global" type="checkbox" …> 全局背景</label>` + `helpTip('所有页使用此背景')` + `</div>`。
   - 为什么不用 `field()`：`field()` 的标签列固定 `72px`，若把复选框放进控件列，标签仍会留在左侧；若把复选框放进标签列，`?` 会被推到控件列末尾，无法紧跟文字。自定义单行模板最直接。
   - 保持 `id="prop-bg-global"` 不变，`bindBackgroundGroup` 中现有的 `change` 绑定无需修改。
   - `label` 包住复选框与「全局背景」，点击文字仍可切换，复选框获得原有可访问名称；`?` 是独立 `button`，不会误触开关。

2. **`?` 紧跟标签，使用既有 `helpTip`，仅覆盖其左外边距。**
   - `.help-tip` 基础样式带 `margin-left: 10px`；在 `.global-bg-row` 内改为 `margin-left: 0`，由行的 `gap: 6px` 控制间距，避免 `?` 离文字过远。
   - 备选（弃）：另写一个 `title` 属性或新 tooltip 组件——会绕开现有浮层的定位、焦点与 Escape 行为，并造成两套提示。

3. **用独立 CSS 类控制行布局与上间距。**
   - `.global-bg-row { display: flex; align-items: center; gap: 6px; margin-top: 12px; }`。
   - 被覆盖页继续使用 `field()`，通过限定在背景分组内的相邻选择器补间距：`.prop-group[data-group="background"] .inline-actions + .field { margin-top: 12px; }`。这样不增加 DOM，也不影响其它分组的 `inline-actions + field` 组合。
   - 选 `12px` 而不是 `8px`：上方按钮网格自身 `gap` 为 `6px`，`8px` 仍会被读成同一组；`12px` 能明确区分「按钮组」与「全局开关」两个层级。
   - 备选（弃）：给 `field()` 增加额外的 class 参数——为一行间距改动共享工具函数，收益不抵影响面。

4. **不改复选框的选中态来源。**
   - 未覆盖页的 `checked` 仍由 `isSource` 决定；被覆盖页仍不勾选。勾选/取消仍调用 `L.app.setGlobalBackgroundPage()` / `clearGlobalBackground()`。

## Risks / Trade-offs

- [`.inline-actions + .field` 依赖 DOM 相邻关系] → 选择器限定在 `.prop-group[data-group="background"]` 内；背景分组中该组合只出现在被覆盖页，且任务中安排覆盖页走查，若结构变动会立即暴露。
- [新行把原来的 11px 字段标签并入 12px 的 `.check-row`，文字略大] → 复选框行统一使用既有 12px；若视觉上过于突出，可在 `.global-bg-row .check-row` 上单独回调字号，不影响布局。
- [`?` 浮层在面板底部可能向下溢出] → 现有浮层会按视口自动翻转到上方（`pos-above`），复用即可；走查时覆盖页面底部场景。
- [行内 `?` 与复选框同处一行，窄面板下可能换行] → 该行只有「☐ 全局背景 ?」，远窄于属性栏最小宽度；使用 `flex` 不换行，不需要额外响应式规则。

## Migration Plan

- 无数据迁移、无 schema 变更。
- 回滚：还原 `js/ui-property-panel.js` 的行模板与 `style.css` 的两条规则即可；项目数据与草稿不受影响。

## Open Questions

- 无。
