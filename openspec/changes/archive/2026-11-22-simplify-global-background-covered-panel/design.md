# Design

## Context

页面背景分组由 `js/ui-property-panel.js` 的 `backgroundGroup(page)` 生成。被覆盖分支当前结构为：

```
.bg-card（缩略图 + 「显示第 X 页的全局背景」来源说明）
.inline-actions（「取消全局背景」按钮）
.field（「全局背景」标签 + 「本页接管」复选框）
```

其中「本页接管」复选框绑定 `prop-bg-global`，与未覆盖分支的全局开关共用同一个 `change` 处理器。`style.css` 另有一条 `.prop-group[data-group="background"] .inline-actions + .field { margin-top: 12px; }` 专门给这一行补间距。拒绝编辑的提示在 `js/app.js`、`js/app-backgrounds.js`、`js/app-presets.js` 三处重复出现，当前文案都包含「或让本页接管」。参见 proposal.md 的动机与 spec 中的行为契约。

## Goals / Non-Goals

**Goals:**

- 被覆盖页只保留「缩略图 → 取消全局背景 → 来源说明」这一条只读路径。
- 来源说明移到取消按钮之后，文案随来源页序号变化。
- 拒绝编辑提示与实际可用操作一致，不再指向已移除的接管控件。

**Non-Goals:**

- 不改变全局指针、`isBackgroundCovered` / `canEditPageBackground` / `setGlobalBackgroundPage` 的模型语义。
- 不改变未覆盖页的「全局背景」开关、图层面板「全局背景 来自第 X 页」行或点击跳转。
- 不改变撤销、草稿持久化、项目 schema、导出与画布命中逻辑。
- 不为「两步接管」新增确认框或引导弹窗。

## Decisions

1. **只删被覆盖分支的复选框，保留未覆盖分支的 `#prop-bg-global`。**
   - `bind()` 在元素不存在时不做任何事，因此 `bindBackgroundGroup` 中现有的 `prop-bg-global` 处理器可以原样保留，仅服务未覆盖页；不新增分支判断。
   - 模型层 `model.setGlobalBackgroundPage(project, page)` 不检查覆盖状态，也不修改：UI 不再从被覆盖页调用它，未覆盖页仍需它完成「先取消、再勾选」的第二步。
   - 备选（弃）：删除 `prop-bg-global` 处理器再按分支重建——会扩大改动面，且无行为收益。

2. **来源说明放在 `.inline-actions` 之后，而不是按钮同一行。**
   - 输出：`... </div><p class="bg-source-note bg-global-note">目前全局背景为第 X 页的背景</p>`。
   - 属性栏宽度有限，按钮与约 20 个字符的说明放进同一个 flex 行会在窄栏换行，形成不稳定的两行按钮区；说明单独成段更可预测。
   - 复用现有 `.bg-source-note`（11px、muted、`margin: 0`），新增 `.bg-global-note { margin-top: 8px; }` 提供与按钮的间距。选 8px：按钮组自身 `margin-top: 4px`，8px 足以把说明读成按钮的从属文本，又不会像新的分组。
   - 保留 `pageNumber(project, source)` 生成序号；悬空指针时 `covered` 为假，不会进入该分支。

3. **文案沿用现有数字排版：`目前全局背景为第 X 页的背景`，数字两侧保留空格。**
   - 现有界面与规范统一使用「第 2 页」而不是「第2页」；用户给出的「第X页」按此排版惯例落地，避免同屏两种数字间距。

4. **拒绝提示统一为 `全局背景生效中，请先取消全局背景。`**
   - 三处 toast 都是同一场景（被覆盖页尝试编辑），保留完全相同的句子，避免三个入口给出不同指引。
   - 不把提示抽成共享常量：改动只是三处字面量，新增跨文件常量会扩大依赖面且不改善可读性。

5. **清理失效的间距规则。**
   - `.prop-group[data-group="background"] .inline-actions + .field` 只匹配被覆盖分支中被删除的「本页接管」行；删除该规则，避免留下无主样式。
   - `.global-bg-row` 及其规则继续服务未覆盖页，不动。

## Risks / Trade-offs

- [移除接管控件后，用户不知道如何让本页成为全局来源] → 未覆盖页仍保留「全局背景」开关；拒绝提示明确要求先取消全局，且 spec 场景覆盖两步路径。走查时验证取消后该页立即出现开关。
- [来源说明位于按钮之后，缩略图旁不再解释来源] → 画布已显示来源背景，图层面板另有「全局背景 来自第 X 页」行；新说明仍留在同一分组内，信息未丢失。
- [三处 toast 文案重复，未来可能漂移] → 本次统一为同一句；若后续再改，可在专项重构中合并，不在本次引入新抽象。
- [删除 `.inline-actions + .field` 规则可能影响其他背景分组] → 该选择器限定 `data-group="background"`，且该分组中只有被覆盖分支产生此相邻组合；走查未覆盖页与背景条目属性确认间距不变。

## Migration Plan

- 无数据迁移、无 schema 变更、无构建变更。
- 回滚：恢复 `backgroundGroup` 被覆盖分支的三段结构、三处 toast 文案与两条 CSS 规则即可；项目与草稿数据不受影响。

## Open Questions

- 无。
