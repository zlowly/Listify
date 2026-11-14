# Tasks

## 1. 选中元素优先命中（内容层）

- [x] 1.1 在 `js/app.js` `onPointerDown` 的 `dividerAt` 之后、内容 `renderer.hitTest` 之前插入选中元素检查：`state.selection.type === 'element'` 时取该元素，图片类型走 `renderer.imageLocalPoint` 旋转局部坐标 + 半宽高判断，其余类型走 `renderer.elementBounds` 矩形判断；命中则按现有 `drag.type === 'move'` 分支建立拖拽（选择不变）。验证：agent-browser 从图层面板选中一张被分类块部分覆盖的自由图片 → 点击被覆盖区域 → 图片移动且分类块不被选中；分类块/自由文字同样可被抓取。
- [x] 1.2 验证小目标仍优先：选中分类块后点击其内部列分隔线 → 调整列宽、块不移动；页面尺寸手柄、元素缩放手柄/旋转手柄在选中状态下仍可操作。
- [x] 1.3 验证回归：选中自由图片后双击其上方的自由文字 → 进入文字编辑（双击维持最上层优先）；点击空白处选中页面；光标在选中块范围内显示 move。

## 2. 选中背景图优先命中（背景层）

- [x] 2.1 在 `js/app.js` `onPointerDown` 中，当 `state.selection.type === 'backgroundImage'` 时，在内容 `renderer.hitTest` 之前调用 `renderer.hitTestBackground`，仅当返回图片 id 等于 `state.selection.imageId` 时走现有 `drag.type === 'move-background'` 分支（含 `ensureCustomBackgroundImage` 的 fit→none 烘焙）；否则维持现状。验证：agent-browser 从图层面板选中某张背景图 → 拖动其被分类块覆盖的部分 → 背景图移动、分类块不被选中、背景编辑状态保持。
- [x] 2.2 验证边界：选中背景集（非具体图）时点击背景与内容重叠处 → 内容被选中、背景图不被拖动；拖动一张 `cover` 背景图（经新优先路径）→ 仍自动转为 `none` 并烘焙矩形；按 Escape 或点击页面标签 → 退出背景编辑。

## 3. 方向键微调

- [x] 3.1 在 `js/app.js` 新增 `nudgeSelection(dx, dy)`：选中元素 → 更新 `element.x/y`（`Math.round`）；背景编辑且选中具体背景图 → 更新 `image.x/y`；选中为页面/背景集 → 不响应。在 `js/ui.js` 现有 `document` keydown 监听器（表单字段守卫之后）加分支：方向键 → `preventDefault` + Shift 步长 ×10 后调用该 API，并在 `L.app` 导出。验证：agent-browser 选中自由图片 → 按右方向键 1 次移动 1px、按住 Shift 按 1 次移动 10px；选中页面时按方向键 → 无元素移动且页面正常滚动。
- [x] 3.2 实现撤销合并：`app.js` 模块级 `nudgeSession = { selectionKey, direction }`（selectionKey 取元素 id 或背景图 id）；同 session 的后续微调不再 `pushUndo`，换方向/换选择重新 `pushUndo`（标签"微调元素"/"微调背景图片"）；在 `onPointerDown` 开头清空 session。验证：连续 3 次同方向微调后 Ctrl/⌘+Z 一次 → 回到该序列首次微调前位置；换方向再微调 → 撤销需两次分别回退；微调 → 拖拽 → 同方向微调 → 撤销不吞掉拖拽。
- [x] 3.3 验证背景图微调：背景编辑状态下选中具体背景图 → 方向键 1px / Shift 10px 移动背景图，内容层不受影响。

## 4. 集成验证

- [x] 4.1 agent-browser 全流程回归：现有操作不受影响（添加/删除图片、背景图缩放手柄、页边距拖动、双击编辑文字、撤销/重做栈上限行为），并走一遍新流程（图层面板选中 → 画布拖拽被盖住的元素 → 方向键微调 → Escape 退出背景编辑）。
- [x] 4.2 运行 `graphify update .` 更新知识图谱，并确认 `openspec validate "grab-selected-element"` 通过。

## Workflow follow-up

- 变更评审满足项目要求后，运行 `openspec archive "grab-selected-element"` 归档（会将 spec delta 合并进主 spec）。
- 归档后核对 `openspec/specs/page-editor/spec.md` 与 `openspec/specs/background-layer/spec.md` 已包含新需求与修订场景。
