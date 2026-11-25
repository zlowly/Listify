# Tasks

## 1. 落点解析与测试

- [x] 1.1 在 `js/app.js` 新增 `insertTarget(selection, project, page)` 纯函数：`selection.type === 'background' | 'background-item'` → background（被覆盖页且非来源页时 `disabled: true` + 提示文案）；其余（`'content-layer'`、元素行、无选中、页面）→ content；导出到 `L.app`
- [x] 1.2 新增 `scripts/checks/insert-target.test.js`（Node `node --test`，经 loader 注入）：覆盖背景行/背景条目子行/`'content-layer'`/元素行/无选中/被覆盖页禁用六类输入
- [x] 1.3 同一测试文件补分类块契约断言：无论 selection 为背景行、背景条目还是 `'content-layer'`，`createCategoryElement` + `page.elements.push` 路径的产物始终在 `page.elements`，且不写 `page.background.items`

## 2. 工具栏 UI

- [x] 2.1 `index.html` 删除背景层按钮组（`btn-add-bg-text` / `btn-add-bg-image` / `btn-add-bg-shape`），保留统一三钮
- [x] 2.2 `js/ui.js`：三钮绑定改为点击时调用 `insertTarget` 分发——content → `L.app.addText` / 现有自由图片入口 / `toggleShapeTool()`；background → `L.app.addBackgroundText` / 背景加图入口 / `toggleShapeTool()`；`disabled` 时点击/聚焦提示 reason
- [x] 2.3 扩展按钮态刷新（现 `updateBackgroundToolButtons` → `updateInsertButtons`）：按 selection 变化、页面切换、全局开关变化更新 `aria-label`（「添加文字」↔「添加背景文字」等）与禁用态；在所有 selection 写入点与 `renderAll` 路径挂接

## 3. 图形工具落点锁定

- [x] 3.1 `js/app.js`：`toggleShapeTool()` 去掉按钮传入的 target 参数，激活时调 `insertTarget` 并把结果存入 `state.shapeTool.target`；再次点击退出、重建时重新解析
- [x] 3.2 `js/app-interactions.js`：拖拽完成的 `drag.target` 改为读取 `state.shapeTool.target`；激活期 toast 文案按锁定落点动态生成（「图形工具：…写入背景层/内容层」）
- [x] 3.3 确认激活期间图层选中变化只刷新工具栏，不修改 `state.shapeTool.target`（含工具激活态下点内容层分组头/背景行的用例走查）

## 4. 图层面板常驻内容层行

- [x] 4.1 `js/ui.js` 图层面板渲染：内容行区顶部新增常驻「内容层」分组头行；空内容层时呈占位样式（如浅色"内容层（空）"）且可点击
- [x] 4.2 新增 selection 类型 `'content-layer'`：点击分组头设置 `state.selection = { type: 'content-layer' }` 并触发工具栏刷新；选中背景行/子行的现有逻辑不变
- [x] 4.3 撤销/走查确认：`'content-layer'` 选中不影响撤销栈、背景编辑态进出（Escape/选页退出）与画布命中

## 5. 验证

- [x] 5.1 `node --test scripts/checks/*.test.js` 全绿
- [x] 5.2 浏览器手动走查：选中背景行加文字/图片/图形；选中内容层分组头（含空内容层）加三类元素；无选中默认落内容层；覆盖页选中背景行时三钮禁用并提示，点内容层分组头后恢复；图形工具激活时锁定落点（激活后换选中再拖拽）；分类块拖入恒落内容层；每个插入动作各撤销一条
- [x] 5.3 `agent-browser` 自动走查一次完整流程（插入 → 落点文案 → 撤销），与手动结果一致
