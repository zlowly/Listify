# Design

## Context

见 `proposal.md`（Why / What Changes）。当前实现把落点计算写在 `js/app-interactions.js` 的 `categoryDropPosition(page, project, cursorY)` 里，遍历 `page.elements` 全量元素；点击/键盘添加（`js/app.js` 的 `placeCategory`）以 `cursorY = Infinity` 复用同一函数，因此两条入口都会把自由图片、自由文字的底边算进去。该函数位于 `app-interactions`（应用子域工厂），被 Node 装载器显式跳过，所以现有 `scripts/checks/*.test.js` 覆盖不到它。

约束：

- 运行时零构建、经典 `<script defer>`，`js/layout.js` 在 `js/app-interactions.js` 与 `js/app.js` 之前加载，`L.layout` 只依赖 `L.model`。
- 分类块高度必须沿用渲染期的量高口径（`layout.elementHeight(..., { editMode: true })`），否则编辑态占位行会让落点偏移。
- 布局回归使用 `scripts/checks/loader.js` 的确定性 `measureText`，新用例不能依赖真实字体度量。

## Goals / Non-Goals

**Goals:**

- 落点计算只认分类块，同时保留既有鼠标 Y 语义。
- 让这段纯计算进入 Node 回归套件，并保证拖放与点击/键盘两条入口共用同一实现。

**Non-Goals:**

- 不引入碰撞避让、自动推开后续分类块或重排自由素材；新块覆盖自由图片是预期结果。
- 不修改分类块手动拖动、缩放、持久化数据格式或导出结果。
- 不修复拖放创建分类缺少撤销快照的相邻缺陷（另行处理）。

## Decisions

### 1. 候选集合按元素类型过滤

只把 `element.type === 'category'` 的条目纳入底边计算；自由文字（`text`）与自由图片（`image`）完全跳过。`element.y <= cursorY` 的门槛保留，`margins.top` 保留为无候选时的回退。

替代方案：给 `elementHeight` 增加"仅分类块"开关——会把放置策略泄漏进通用量高函数，且调用方仍需自行过滤，弃用。

### 2. 保留鼠标 Y 语义

拖放仍取"鼠标上方最低分类块底边"；点击/Enter 以 `Infinity` 调用，天然等于"鼠标位于所有分类块下方"，落到页面内最低分类块底边。已与用户确认，不改成一律追加到栈底，否则拖到中间插入会失效。

### 3. 计算下沉为 `layout.categoryDropPosition`

在 `js/layout.js` 新增并导出：

```js
categoryDropPosition(page, project, cursorY) -> { x, y }
```

- `x` 固定为 `project.margins.left`；`y` 为候选分类块底边最大值，无候选时为 `project.margins.top`，最后 `Math.max(0, Math.round(y))`。
- 分类块量高走 `layoutCategory(category, element, { editMode: true }).blockHeight`（经 `elementHeight`），与画布一致；分类引用缺失时沿用现有容错（空歌单）。
- 入参防御：`page`/`project`/`page.elements` 缺失时按空页处理，返回 `{ x: 左内边距或 0, y: 上内边距或 0 }`。

`js/app-interactions.js` 删除本地实现，`onDrop` 与对外暴露的 `categoryDropPosition` 改为指向 `layout.categoryDropPosition`；`js/app.js` 的 `placeCategory` 直接调用 `L.layout.categoryDropPosition`。

替代方案一：把函数放进 `model.js`。可行，但放置属于排版策略而非数据模型，且 `model` 不持有量高逻辑，会反向依赖 `layout`，破坏现有单向依赖。
替代方案二：保留在 `app-interactions`，用浏览器自检（`js/dev-checks.js`）覆盖。该文件为开发期控制台自检且不进产物，无法在 `node --test` 中运行，覆盖强度不足。

### 4. 回归用例放 `scripts/checks/layout.test.js`

用现有 `loader.js` + `project()` / `categoryElement()` 夹具构造页面，断言：

- 页面上只有自由图片（含图片在分类块下方、图片是唯一元素）时，落点等于上边距；
- 分类块下方有更低的自由图片时，落点等于最低分类块底边；
- `cursorY = Infinity` 落到最低分类块底边；
- 鼠标在所有分类块上方时为上边距；
- 自由文字同样不参与。

## Risks / Trade-offs

- [新分类块覆盖自由图片，用户可能误以为漏排] → 这是规格确认的预期行为；不改代码，靠行内提示与既有"分类块可手动拖动"兜底。
- [需求反转导致 OpenSpec 场景无法在 MODIFIED 中重命名] → delta 使用 `REMOVED 分类块放置` + `ADDED 分类块堆叠放置`；归档后该需求会位于 `category-layout` 规格末尾，属于可接受的文档顺序代价。
- [`elementHeight` 的 `editMode` 口径与导出态不同] → 保留现状；落点只用于编辑态创建，导出态不涉及定位。
- [抽取函数改变 `interactions.categoryDropPosition` 的归属，可能有未发现的调用方] → 保留同名导出作为转发，`grep` 全仓确认仅 `js/app.js` 与 `js/app-interactions.js` 两处调用。

## Migration Plan

无数据迁移。发布即生效，旧项目 JSON 与导出 PNG 不受影响；回滚只需恢复两处调用与删除新增函数。

## Open Questions

（无）
