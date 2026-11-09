# Tasks

## 1. 数据模型与持久化

- [x] 1.1 在 `js/model.js` 的 `createCategoryElement()` 返回值中加入 `showTitle: true`；验证：新建分类块后，在浏览器控制台执行 `Listify.app.state.project.pages[0].elements.at(-1).showTitle`，结果为 `true`。
- [x] 1.2 在 `js/io.js` 的 `serializeElement()` 分类块分支写入 `showTitle: element.showTitle !== false`，并在 `buildProject()` 的分类块分支以同样的默认值读取；验证：保存项目后 JSON 中含该字段；加载一个不含该字段的旧项目，分类名仍正常显示。

## 2. 布局与渲染

- [x] 2.1 在 `js/layout.js` 的 `layoutCategory()` 中，当 `showTitle === false` 时不生成标题行、令标题高度为 0，并且首个表格的 Y 不再累加 `TITLE_GAP`；验证：控制台把某分类块 `showTitle` 设为 `false` 后，`layoutCategory(...).blockHeight` 变小且 `tables[0].y` 减小。
- [x] 2.2 在 `js/render.js` 的 `drawCategory()` 中，隐藏时跳过分类名绘制；验证：画布上分类名消失、歌名整体上移，编辑态块边框仍完整。
- [x] 2.3 确认 `layout.elementHeight()`、`render.elementBounds()`、`render.hitTest()` 与拖放堆叠逻辑无需改动即可使用收缩后的高度；验证：在一个隐藏分类名的块下方拖入新分类，新块贴在其收缩后的底边，而不是原底边。
- [x] 2.4 验证边界：隐藏且没有歌名的分类块只保留块内边距，仍可在画布或图层面板选中；验证：创建空分类块、隐藏分类名，检查其高度约为上下内边距之和且可点选。

## 3. 属性面板

- [x] 3.1 在 `js/ui.js` 的 `renderCategoryProperties()` “分类名子分区”分组中加入“显示分类名”复选框，绑定到 `element.showTitle`；验证：取消勾选后画布立即更新，重新勾选后分类名与样式恢复。
- [x] 3.2 隐藏状态下保留标题样式字段可编辑并显示提示“隐藏时样式保留，重新显示后生效”；验证：隐藏后修改字号，重新显示时应用新字号且无报错。

## 4. 导出与集成验收

- [x] 4.1 验证隐藏状态下“完整页面”和“仅歌单层（透明底）”两种 PNG 导出都不出现分类名，并确认自由文字/图片的既有过滤规则未改变。
- [x] 4.2 验证持久化往返与旧项目兼容：隐藏后保存并重新加载仍为隐藏；加载无该字段的旧项目时默认显示分类名。
- [x] 4.3 运行 `openspec validate "add-category-title-toggle" --type change --strict`，修复报告的问题直至通过。

## Workflow follow-up

- 实现与手动验证完成后归档该 change。
