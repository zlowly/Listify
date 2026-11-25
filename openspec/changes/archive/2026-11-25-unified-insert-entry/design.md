# Design

## Context

数据模型保持 `page.background = { color, items[] }` 与 `page.elements` 双结构不变；全局背景指针 `globalBackgroundPageId`、渲染分层、导出过滤、命中优先级全部沿用现状。本 change 只改"插入落点的决定方式"与其 UI 呈现。动机见 proposal.md。

现状落点由按钮分组决定：`ui.js` 里内容层三钮与背景层三钮（`btn-add-bg-image` 等）分别绑定 `L.app.addText` / `L.app.addBackgroundText` 等入口；`app.js` 的 `toggleShapeTool(target)` 接收按钮传入的 `'content'|'background'`；`app-interactions.js` 拖拽完成时按 `drag.target` 写入。

## Goals / Non-Goals

**Goals:**
- 工具栏插入区收敛为一组三钮，落点由图层面板选中状态解析
- 图层面板新增常驻「内容层」分组头行，两层的落点指示对称可见
- 图形工具落点在激活时锁定
- 分类块恒落内容层成为规格契约 + 回归用例

**Non-Goals:**
- 不取消内容层/背景层概念（构想一已否决）
- 不改图层面板的分组结构与背景条目子行
- 不改背景编辑态的进入/退出规则与画布命中优先级

## Decisions

1. **落点解析集中为一个纯函数 `insertTarget(selection, project, page)`**：入参为当前 `state.selection` 与项目/页，返回 `{ target: 'content'|'background', disabled: boolean, reason?: string }`。规则：`selection.type === 'background' | 'background-item'` → background（被覆盖页且非来源页时 `disabled`，`reason` 为提示文案）；其余（`'content-layer'`、元素行、无选中、页面）→ content。备选方案：在每个按钮 handler 内各自判断——否决，逻辑分散易漂移。
2. **图层面板常驻「内容层」分组头行**：新增 selection 类型 `'content-layer'`（独立于 `'page'`，语义不同：页面选中不改落点兜底规则之外的状态显示）。空内容层时行仍渲染，呈占位样式。点击该行不改变画布选中元素，只设置 `state.selection = { type: 'content-layer' }` 并刷新工具栏。
3. **图形工具激活时锁定**：`toggleShapeTool()` 不再接收 target 参数，激活时调 `insertTarget` 存入 `state.shapeTool.target`；拖拽完成沿用该值（现 `drag.target` 赋值点改为读锁定的 target）。激活期间改变图层选中只刷新工具栏文案，不改 `state.shapeTool.target`。备选的"每次拖拽实时跟随"已由用户否决（Q2）。
4. **按钮态刷新**：扩展现有 `updateBackgroundToolButtons` 为 `updateInsertButtons`，在 selection 变化、页面切换、全局背景开关变化后调用；更新 `aria-label`（如「添加背景文字」「添加文字」）、`disabled` 与覆盖页提示（toast/`title` 沿用现有提示通道）。
5. **`index.html` 删除背景层按钮组**：`btn-add-bg-*` 三钮移除，`ui.js` 绑定改为统一三钮按 `insertTarget` 分发到既有入口（`addText`/`addBackgroundText`、自由图片/背景加图、`toggleShapeTool`）。既有后台函数保持签名不变，缩小 diff。

## Risks / Trade-offs

- [落点不可见导致误插] → 分组头行常驻 + 按钮动态文案 + 覆盖页禁用提示三重冗余；浏览器走查覆盖空内容层、空背景两类边界。
- [图形工具锁定语义与旧规格矛盾] → 规格已在 shape-tool delta 中反转为"激活时锁定"，tasks 中按 delta 归档后同步主规格。
- [分类块未来被误接入选中逻辑] → 规格 MUST NOT 契约 + Node 回归断言双保险。

## Migration Plan

纯前端交互变更，无数据迁移。实施顺序：insertTarget 纯函数与测试 → 工具栏 UI → 图形工具 → 图层面板 → 走查。回滚即 revert 单次提交。

## Open Questions

（无）
