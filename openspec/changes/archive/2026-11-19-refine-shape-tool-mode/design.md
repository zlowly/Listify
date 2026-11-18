# Design

## Context

- 图形工具的运行时状态只有一处：`state.shapeTool = { active, target, pageId, preview }`（`js/app.js:21`）。入口有两条：工具条 `#btn-add-shape` 调 `toggleShapeTool('content')`，属性面板 `#prop-bg-add-shape` 调 `toggleShapeTool('background')`。
- 工具条按钮是 `index.html` 里的静态节点，`updateShapeToolButton()`（`js/app.js:302`）可以安全地命令式改它的 `aria-pressed`/`is-active`；属性面板按钮由 `backgroundGroup()`（`js/ui-property-panel.js:221-269`）每次重渲染生成，命令式改动会被下一次 `ui.renderAll()` 抹掉。
- 面板的背景分组在 `selection.type` 为 `page` 或 `background` 时都会渲染（`renderPropertyPanelBody` 兜底走 `renderPageProperties`），因此 armed 期间按钮仍在 DOM 中，具备显示按下态的位置。
- 画布光标由 `updateCursor()`（`js/app-chrome.js:525`）在 rAF 中根据页面尺寸手柄、缩放手柄、列分隔线、内容命中、背景命中、边距手柄逐级判定，并写入 `surface.overlay.style.cursor` 内联样式。`style.css:972` 的 `.shape-tool-active ... { cursor: crosshair }` 是 CSS 规则，永远输给内联样式，因此当前实际效果是十字只在指针尚未移动时短暂出现。
- 创建路径：`onPointerDown` 的 `shape-draw` 分支 → `onPointerMove` 更新 `state.shapeTool.preview` → `onPointerUp` 调 `createShapeFromDrag()`（`js/app-interactions.js:434-475`），后者只 pushUndo + 追加条目 + toast；`onPointerUp` 末尾统一 `ui.renderAll()`（`:525`）。
- 页面外空白处按下会走到 `js/app-interactions.js:258`，直接 `state.selection = {type:'page'}` 并 `ui.renderAll()`，没有退出工具。
- 图层面板背景行的「＋」由 `js/ui.js:587` 生成、`:704-709` 绑定；`openPresetPicker('add')` 同时被属性面板「＋ 图片」使用（`js/ui-property-panel.js:280`）。
- 约束：零构建、classic script、UI 不得直接改模型、光标合帧（`canvas-view` spec 要求每帧至多一次）。纯逻辑 Node 测试不覆盖 DOM 交互。

## Goals / Non-Goals

**Goals:**

- 图形工具的生命周期、可见性与真实状态一致：任何时刻用户都能从按钮、光标、提示判断"是否 armed、落在哪一层"。
- 一次 armed 只产出一个图形，产出后立刻可编辑它。
- 删除图层栏重复的追加图片入口，不破坏背景图片仍可从属性面板追加。

**Non-Goals:**

- 不改数据模型、项目格式、导出结果、撤销粒度。
- 不新增常驻模式条 / 画布浮层 chip / 工具栏新按钮；模式反馈只由既有入口按钮与光标承担。
- 不改变背景组的按钮网格、文案与既有布局（`editor-shell` 的两列等宽规则保持）。
- 不重做 `toggleShapeTool` 的整体 API 形状；保留 `target` 概念。

## Decisions

**1. armed 状态继续由 `state.shapeTool` 单一来源派生，不新增并行标志。**
两个入口、光标、提示都读同一个 `state`。替代方案（单独 `shapeMode` 布尔、事件总线通知各视图）会引入同步点，且现有 `exitShapeTool()` 已经是唯一的退出路径，扩展它比新增状态更小。

**2. 面板按钮的按下态在渲染期派生；工具条按钮保留命令式更新。**
`backgroundGroup()` 读取 `state.shapeTool` 输出 `class="btn btn-sm is-active"` 与 `aria-pressed="true"`（条件：`active && target==='background' && pageId===currentPage.id`）。命令式补丁不可行，因为 `toggleShapeTool` 在 `ui.renderAll()` 之前执行。工具条按钮不在重渲染范围内，`updateShapeToolButton()` 继续负责它以及 `#canvas-pane.shape-tool-active`。`updateShapeToolButton()` 的调用位置保持在 `renderAll` 前后皆可，但面板态不依赖它。
样式上新增 `.btn.is-active`，沿用 `.icon-btn.is-active` 的色语言（`--blue-soft` 底、`--blue` 边与字），不改 padding，保证 300px 两列网格不折行。

**3. 光标在 `updateCursor()` 最前面短路，退出时主动重算。**
在函数开头判断 `state.shapeTool.active && pageId === currentPage.id`，命中则直接进入既有 `lastAppliedCursor` 比较并写 `crosshair`，跳过手柄/命中/边距判定。理由：短路留在 rAF 内，满足"每帧至多一次"；若在事件层另加判断，会多一条同步路径并且仍被后续内联写入覆盖。页面外同样保持十字（spec 定义为"画布指针为十字"），不引入 `not-allowed`，避免多一种状态要解释。
退出路径必须触发一次重算：`exitShapeTool()` 调 `chrome.refreshHoverCursor()`（覆盖 Esc、切页、图层点选等键盘/面板路径）；`onPointerUp` 在 `ui.renderAll()` 之后也调一次（覆盖"创建完指针还停在画布上"的路径，此时 `surface.hoverPoint` 已被本帧事件刷新）。`style.css` 的 `.shape-tool-active` 规则保留为无内联值时的兜底，不删除。

**4. 创建顺序固定为：创建 → pushUndo → 追加 → 设选择 → 退出 → toast，交给统一的末尾 renderAll 落地。**
在 `createShapeFromDrag()` 内直接写 `state.selection`（内容层 `{type:'element', id}`，背景层 `{type:'backgroundItem', itemId}`）再 `exitShapeTool()`，不调用 `selectElement` / `selectBackgroundItem`：那两个动作各自会 `exitShapeTool()` + `ui.renderAll()`，在 pointerup 中会造成多次重渲染并让属性面板的焦点恢复跑两遍。现有 `onPointerUp` 末尾的 `ui.renderAll()`（`:525`）足以一次性画出新选择。
背景层选择还意味着进入背景编辑态，与"创建后马上调色"的意图一致。

**5. 页面外按下复用 `actions.selectPage()`。**
把 `js/app-interactions.js:258` 的两行替换为 `actions.selectPage()`：它已经包含 `exitShapeTool()` 与重绘分支，且行为与"选中页面"完全一致，不新增导出或守卫。

**6. 删除图层栏背景行的「＋」，同时删掉空的动作位。**
移除 `js/ui.js:587` 的按钮与 `:704-709` 的监听；该行不再有动作按钮，`row-actions` 包装一并去掉（背景行仍保留全局药丸）。`openPresetPicker('add', null)` 继续由属性面板使用，签名不变。
代价：选中某个背景条目时属性面板显示条目属性，背景分组不可见；追加图片要先点图层背景组行（选中背景集）或选中页面。这是既有信息架构，接受为取舍，不额外加入口。

**7. 文案改为单发语义。**
toast 改为"…画一次即退出，Esc 取消"，工具条 `aria-label`/`title` 与面板按钮 `aria-label` 同步；`docs/歌单生成器需求.md:80` 与 `README.md` 的"保持激活、可连续绘制"改为单发描述。

## Risks / Trade-offs

- [移除图层栏的唯一追加图片图标后，用户在"选中背景图"状态下找不到追加入口] → 属性面板在选中页面/背景集时仍显示「＋ 图片」；选中背景组行即可回到该分组。在任务中加入手动验证这一步的路径。
- [面板每渲染一次都要重算按下态，若 `pageId` 与当前页不一致会误显示] → 条件同时校验 `pageId === currentPage.id`；切换页面本来就会退出工具。
- [在 `updateCursor` 最前短路后，若 `refreshHoverCursor` 的调用时机早于 `hoverPoint` 更新，退出瞬间光标可能残留一帧十字] → 在 `onPointerUp` 的 `renderAll` 之后再刷一次；下一次指针移动必然纠正，且不阻断交互。
- [单发会打断"连画一排色块"的批处理习惯] → 用户只需再点一次入口；相比每次都要手动退出，净操作次数不增加，且 spec 已按单发改写。
- [直接写 `state.selection` 绕过了选择动作里的 `canEditPageBackground` 守卫] → 创建前已经在 `createShapeFromDrag` 里对背景落点做过同一守卫，且在 armed 前 `toggleShapeTool` 也拦截过被全局覆盖的页面。
- [命令式更新工具条与渲染期派生面板态并存，未来加第三个入口容易漏] → 在 `updateShapeToolButton()` 上方注明"静态节点才可命令式"的约定，并让面板条件从 `state.shapeTool` 单点派生。
- [删除按钮可能留下引用（无障碍文案、任务脚本、测试）] → 任务中显式搜索 `data-bg-add`、`添加背景图片`、`新增背景` 再收尾。

## Migration Plan

无数据迁移。改动只涉及运行时 UI 状态与入口；回滚即还原本轮提交。`dist/` 在下次 `./build.sh` 时自然重建。

## Open Questions

无阻塞项。切换页面即退出的既有规则、背景覆盖页不提供背景落点的既有规则均保持不变，不需要在本轮重新决定。
