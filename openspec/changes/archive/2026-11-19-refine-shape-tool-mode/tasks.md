# Tasks

## 1. 图形工具改为单发并接管新图形

- [x] 1.1 在 `js/app-interactions.js` 的 `createShapeFromDrag()` 中记录新条目 id：内容层写 `state.selection = { type: 'element', id }`，背景层写 `{ type: 'backgroundItem', itemId }`，随后调用 `actions.exitShapeTool()`；保持既有的 pushUndo → 追加 → toast 顺序与末尾统一 `ui.renderAll()`。验证：`/opsx-apply` 后在浏览器从工具条画一个图形，工具立即退出且新图形选框可见、属性面板显示形状/颜色/圆角/边框；再在空白处拖拽不会产生第二个图形。
- [x] 1.2 把 `js/app-interactions.js:258` 附近的页面外空白落点改为调用 `actions.selectPage()`（该动作已包含退出工具），使 armed 期间在页面外按下取消工具而不创建。验证：armed 后点击页面外灰色画布，工具退出、指针恢复普通光标，随后再在页面内拖拽不会画图。
- [x] 1.3 把 `js/app.js` 中 `toggleShapeTool()` 的两条 toast 改为单发文案（如"…画一次即退出，Esc 取消"），并同步 `js/ui.js:246` 与 `index.html` 工具条按钮的 `aria-label`/`title`。验证：点击任一入口后提示文案不含"连续"或"保持激活"，且提示在 2.8s 内自动消失。
- [x] 1.4 同步需求文档：改写 `docs/歌单生成器需求.md` 第 79–81 行中"创建后工具保持激活，可连续绘制"为单发 + 创建后选中新图形，并核对 `README.md` 对应描述。验证：`grep -n "连续绘制\|保持激活" docs/ README.md` 不再命中旧行为。

## 2. 模式反馈：入口按下态与固定十字光标

- [x] 2.1 在 `js/ui-property-panel.js` 的 `backgroundGroup()` 渲染期派生「＋ 图形」状态：`state.shapeTool.active && target === 'background' && pageId === page.id` 时输出 `is-active` 与 `aria-pressed="true"`，否则 `aria-pressed="false"`；不得改动按钮尺寸或 `bg-actions` 两列网格。验证：点击「＋ 图形」后指针移到画布，按钮仍显示蓝色按下描边；在 300px 检查栏宽度下四个动作按钮仍为两列不折行。
- [x] 2.2 在 `style.css` 新增 `.btn.is-active`（`--blue-soft` 底、`--blue` 边与字），与 `.icon-btn.is-active` 保持同一色语言；验证：按下态与普通 `.btn` 的 padding/行高一致，切换工具后视觉立即恢复。
- [x] 2.3 在 `js/app-chrome.js` 的 `updateCursor()` 最前面短路：`state.shapeTool.active && state.shapeTool.pageId === actions.currentPage().id` 时直接把 `crosshair` 写入并走既有 `lastAppliedCursor` 比较，跳过手柄/内容/背景/边距判定。验证：armed 后把指针移到已选中图片的角手柄、表格列分隔线与页面尺寸手柄上，光标始终为十字。
- [x] 2.4 退出路径刷新光标：`js/app.js` 的 `exitShapeTool()` 调 `appCtx.chrome.refreshHoverCursor()`；`js/app-interactions.js` 的 `onPointerUp` 在 `ui.renderAll()` 之后再调一次。验证：arm 后按 Esc、切页、或在页面内画完一个图形，指针停在画布上时光标立刻回到 `move`/`resize`/默认，不残留十字。
- [x] 2.5 在 `js/app.js` 的 `updateShapeToolButton()` 上方补一行约定注释：静态节点可命令式更新，面板按钮状态必须在渲染期派生。验证：代码审查确认注释存在，且没有对 `#prop-bg-add-shape` 的命令式 `classList`/`setAttribute` 写入。

## 3. 移除图层栏背景行的追加图片入口

- [x] 3.1 删除 `js/ui.js:587` 的「＋」按钮与 `:704-709` 的 `[data-bg-add]` 监听；当背景行不再有动作按钮时去掉该行的 `row-actions` 空包装，保留背景名称、计数、全局标记与「底层」药丸。验证：图层视图背景行右侧无按钮、无空白占位，行高与内容行一致。
- [x] 3.2 确认删除未影响属性面板「＋ 图片」：`openPresetPicker('add', null)` 仍由 `js/ui-property-panel.js:280` 调用，且预设弹窗可正常追加图片。验证：选中页面 → 背景分组点「＋ 图片」→ 选一张预置图 → 背景条目数 +1，撤销一次可回退。
- [x] 3.3 清理残留引用并核对无障碍：`grep -rn "data-bg-add\|新增背景" js/ index.html style.css openspec/specs/` 只应命中已改写的 spec 文本或无命中；读屏浏览图层行只朗读上移/下移动作按钮。验证：grep 结果与上述一致。

## 4. 集成验证

- [x] 4.1 运行 `node --test scripts/checks/*.test.js`，确认纯逻辑套件全部通过（本次不改模型与几何）。验证：退出码 0，报告无失败用例。
- [x] 4.2 浏览器手动走一遍完整流：工具栏画内容图形 → 属性面板改色/圆角；背景分组「＋ 图形」画背景图形 → 自动选中、按下态消失、图层背景条目出现；对全局背景覆盖页确认「＋ 图形」不出现且工具栏落点仍为内容层；按 Esc / 再点入口 / 切页确认取消不创建。验证：每步观察结果与 `openspec/changes/refine-shape-tool-mode/specs/` 的场景一致。
- [x] 4.3 生成发布产物并抽查：`./build.sh` 成功，`dist/` 中不含 `js/dev-checks.js`，`dist/js/app.js` 的 `BUILD` 与 `?v=` 一致；验证：退出码 0，抽查 `dist/index.html` 的版本参数。

## Workflow follow-up

- 评审通过后归档变更：`openspec archive refine-shape-tool-mode`。
- 归档后核对 `openspec/specs/shape-tool/spec.md` 与 `background-layer`、`editor-shell` 已吸收本次 delta，且无残留「连续绘制」表述。
