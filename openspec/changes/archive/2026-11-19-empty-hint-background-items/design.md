# Design

## Context

画布空态提示由 `ui.updateEmptyHint` 控制，当前判定是 `project.playlist.categories.length === 0 && page.elements.length === 0`（`js/ui.js`）。背景层是页面上的独立值 `page.background = { color, items[] }`，条目含图片与图形；全局背景生效时当前页实际显示的是源页背景（`model.effectiveBackground`），悬空指针按无全局处理。所有改变页面或背景的操作最终都会调用 `ui.renderAll()`，它再调用 `ui.updateEmptyHint()`，因此显隐刷新链路已经存在，缺的是判定条件。详见 `proposal.md`。

## Goals / Non-Goals

**Goals:**

- 空态判定把「当前页有效背景有条目」视为页面非空，覆盖图片、图形、整套背景替换与全局背景。
- 判定逻辑可在零依赖 Node 回归中测试，不依赖 DOM 或 canvas。
- 保持现有空态文案、样式、位置和渲染刷新路径不变。

**Non-Goals:**

- 不把背景填充色或页边距等设置当作内容。
- 不改动背景数据结构、全局背景语义、图层顺序或导出。
- 不改动画布空态以外（分类空态）的判定。

## Decisions

- **把判定放进 `js/model.js` 的纯函数**：新增 `model.isPageEmpty(project, page)`（名称以实现为准），内部复用 `effectiveBackground`，检查 `items`（兼容旧 `images` 字段）是否有条目，并同时检查 `page.elements` 与 `project.playlist.categories`。`ui.updateEmptyHint` 只调用它并设置 `hidden`。理由：项目约定纯逻辑集中在 model，`scripts/checks/model.test.js` 通过 `loader.js` 直接加载 `js/model.js`，可覆盖全局背景、悬空指针和清空背景等分支。替代方案是把条件写在 `ui.js`，但 UI 脚本不进 Node 回归，无法自动验证。
- **以「有效背景」而非 `page.background` 判定**：全局背景生效时用户看到的条目来自源页，若只看本页数据会在全局背景带图片时错误显示空态。`effectiveBackground` 已处理悬空指针回退，直接复用。
- **只统计条目，不统计填充色**：空态文案是导入引导，仅改颜色时页面仍无内容，提示继续显示更符合引导目的；规格中已用场景固定该行为。
- **不改刷新时机**：现有 `ui.renderAll()` 已在添加/删除背景条目、复制/清空背景、设置/取消全局背景、撤销等路径调用，复用即可；不新增事件或 MutationObserver。

## Risks / Trade-offs

- [旧草稿的背景可能用 `images` 字段而非 `items`] → 判定函数同时接受两者，与 `clonePageBackground`、`app-backgrounds.items()` 的兼容写法一致。
- [未来新增背景条目类型未计入] → 判定按「条目数组非空」而非按 `kind` 白名单，任何新条目类型自动计入。
- [用户只改填充色仍看到空态] → 已作为规格场景明确，若后续产品要求改变，只需调整纯函数与对应用例。
