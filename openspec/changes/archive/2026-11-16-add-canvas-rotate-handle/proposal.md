# Proposal

## Why

图片旋转目前只能通过右侧属性检查栏的数字框输入角度，缺少鼠标直接操作的入口。而 `canvas-view`、`page-editor`、`background-layer` 三处 spec 已经文档化了一个“旋转手柄”（画布上绕中心旋转的手柄、缩放/滚动后与页面对齐、命中优先级、背景图与内容图同一套手柄规则），但代码从未实现——`imageHandlePoints` 只返回 8 个缩放手柄，`handleAt` 只识别 `resize`/`resize-background`。本 change 把 spec 已承诺的旋转手柄真正实现出来，并固化 spec 留白的交互细节。

## What Changes

- 为内容层自由图片、以及背景集内的图片，在选中状态下于画布上提供一个**旋转手柄**：选框顶边中点向上伸出一段茎线，末端为圆形手柄（grab 光标）。
- 拖动手柄做圆周运动 → 图片**绕元素中心**旋转（与 `page-editor`「自由图片」已规定的“图片绕元素中心旋转”一致）。
- 拖拽默认吸附 15°，按住 Ctrl/⌘ 自由拖拽；拖拽过程中显示当前角度。
- 命中优先级遵循现有 spec：页面手柄 > 缩放/旋转手柄 > 列分隔线 > 抓取选中元素；旋转手柄在缩放手柄之前命中。
- 内容图经 `setElementField('rotation', …)` 回写（配合 `normalizeAngle` 归一到 [-180,180]）；背景图经 `setBackgroundImageValue(…, 'rotation', …)` 回写（保留 -360..360 并同步 `prop-bg-rotation` 输入）。
- 旋转拖拽计入撤销（`pushUndo('旋转图片')` / `'旋转背景图片'`），复用现有 `beginPointer` 指针捕获模式。
- 属性检查栏的旋转数字框保留，作为精确输入入口。
- 复用现有 `model.rotationRadians` / `model.rotateVector` / `ui.normalizeAngle`，不新增重复实现；零构建、经典 `<script>` 约束不变。

## Capabilities

### New Capabilities

（无。旋转手柄已被现有 capability 文档化，本次为补齐实现并固化交互细节，不引入新 capability。）

### Modified Capabilities

- `page-editor`: 新增“图片旋转手柄与拖拽”需求——内容自由图片在选中时显示旋转手柄，圆周拖拽绕中心旋转；吸附/自由、当前角度反馈、命中优先级与回写范围。
- `background-layer`: 新增“背景图旋转手柄”需求——背景图在背景编辑状态下与内容图共用同一套旋转手柄/命中/光标规则，圆周拖拽绕中心旋转；具体化此前“旋转与内容图同一套规则”的约定。

## Impact

- 代码：`js/app-chrome.js`（第 9 个旋转手柄点、stem/圆绘制、`handleAt` 命中、旋转悬停光标）、`js/app-interactions.js`（`type:'rotate'` 拖拽分发与角度计算）、`js/model.js`（复用旋转数学；如需新增纯函数则保持单一实现）。
- 规格：`openspec/specs/page-editor/spec.md`、`openspec/specs/background-layer/spec.md` 各新增一条需求及场景；`canvas-view` 既有措辞已覆盖旋转手柄，预计不改。
- 回归：`scripts/checks/*.test.js` 增加旋转角度计算的纯逻辑用例（无 canvas/交互/IndexedDB）。
- 无新增运行时依赖；不改变运行时语义、文件结构与构建；`build.sh` 不受影响。
