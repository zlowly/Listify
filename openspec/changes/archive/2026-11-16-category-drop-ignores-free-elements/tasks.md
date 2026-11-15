# Tasks

## 1. 共享落点计算

- [x] 1.1 在 `js/layout.js` 新增并导出 `categoryDropPosition(page, project, cursorY)`：只把 `element.type === 'category'` 纳入候选，保留 `element.y <= cursorY` 门槛与 `margins.top` 回退，`x` 取 `project.margins.left`，`y` 取 `Math.max(0, Math.round(...))`；分类块量高继续走 `elementHeight(..., { editMode: true })`，缺失 `page`/`project`/`elements` 时返回边距兜底。验证：`grep -n "categoryDropPosition" js/layout.js` 能看到导出，且函数内没有 `type === 'text'` / `type === 'image'` 分支。
- [x] 1.2 删除 `js/app-interactions.js` 中重复的 `categoryDropPosition` 实现，改为引用 `layout.categoryDropPosition`，`onDrop` 与返回对象里的同名方法都指向共享实现。验证：`grep -rn "function categoryDropPosition" js/` 只在 `js/layout.js` 命中一处。
- [x] 1.3 把 `js/app.js` 的 `placeCategory` 从 `ctx.interactions.categoryDropPosition(page, state.project, Infinity)` 改为直接调用 `L.layout.categoryDropPosition(...)`，保持 `pushUndo('放置分类')` 与后续创建逻辑不变。验证：`grep -n "categoryDropPosition" js/app.js` 只剩一处调用且指向 `layout`。

## 2. 回归覆盖

- [x] 2.1 在 `scripts/checks/layout.test.js` 增加 `categoryDropPosition` 用例：唯一元素是自由图片时落点上边距；分类块下方有更低自由图片时落点为最低分类块底边；`cursorY = Infinity` 落到最低分类块底边；鼠标高于所有分类块时为上边距；自由文字同样不参与。断言高度用现有确定性 `measureText` 基线。验证：`node --test scripts/checks/layout.test.js` 全绿。
- [x] 2.2 跑完整零依赖回归。验证：`node --test scripts/checks/*.test.js` 退出码 0，无新增失败。

## 3. 浏览器验收

- [x] 3.1 用 `agent-browser` 打开 `index.html`，导入含至少两个分类的歌单，点“添加图片”并把图片拖到页面下方，然后点击左侧未放置分类：断言新分类块上边缘等于最低分类块底边、可与图片重叠，且不被图片底边下推；再把另一分类拖到页面顶部空白处，断言落到上边距。验证：截图与元素坐标读数符合上述断言，控制台无 `L.devChecks` 报错。

## 4. 收尾

- [x] 4.1 确认规格增量仍通过严格校验。验证：`openspec validate category-drop-ignores-free-elements --strict` 输出 `is valid`。
- [x] 4.2 更新知识图谱。验证：`graphify update .` 正常结束，`graphify-out/` 反映 `layout.categoryDropPosition` 新节点。

## Workflow follow-up

- 实施完成并验收后运行 `/opsx-archive` 归档 `category-drop-ignores-free-elements`，把 `REMOVED 分类块放置` + `ADDED 分类块堆叠放置` 合入 `openspec/specs/category-layout/spec.md`。
- 归档后接受该需求位于 `category-layout` 规格末尾的顺序变化；如需恢复首位，单独调整主规格顺序而不改行为。
- 拖放创建分类缺少 `pushUndo('放置分类')` 不在本变更范围，另开变更处理。
