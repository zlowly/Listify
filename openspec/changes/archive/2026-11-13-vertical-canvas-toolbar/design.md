# Design

## Context

`#canvas-toolbar` 当前是绝对定位在画布左上（`top/left: 12px`）的横向 `flex + flex-wrap` 浮动条，三组依次为：页面组（横向 `.page-tabs` 文字页签 + 新增/删页 `icon-btn`）、插入组（“添加文字”/“添加图片”文字按钮）、缩放组（`−` / `%` 文本框 / `＋` / “适应窗口”）。它通过 `js/app.js` 的 `toolbarChromeTop()`（返回工具条高度 + 24）参与画布适配：`measureCanvas()` 用它扣减可用高度算 `fitScale`，`syncGeometry()` 用它作为页面内容的纵向偏移 `chromeTop`（进入 `contentH` 与 `originY`）。项目零构建、`file://` 可打开，无 SVG 惯例，图标目前混用 Unicode（＋/🗑/−）与文字按钮。动机见 proposal.md。

## Goals / Non-Goals

**Goals:**
- 工具条从横向改为贴在画布可视区左缘的竖向窄条，用横向富余空间换回被挤占的垂直空间。
- 动作按钮图标化，文字标签改为悬停/焦点浮动提示；页签改为数字图标页签。
- 画布“适应窗口”改为为左缘竖条预留水平偏移，页面不被竖条遮挡，且不进入导出。

**Non-Goals:**
- 不改变任何动作的行为（增删页、添加文字/图片、缩放范围与模式、粘贴、导出、项目存取）。
- 不新增依赖、构建、网络请求或数据格式；不引入图标字体或图标库。
- 不改 `canvas-view` 的缩放行为规格与 `page-editor` 的页面管理行为规格（朝向/形态变化只落在 `editor-shell`）。

## Decisions

### D1. 竖向 flex，贴左缘、垂直居中
`.canvas-toolbar` 改为 `flex-direction: column`、固定窄宽（约 56px），定位 `left: 12px; top: 50%; transform: translateY(-50%)`，在画布可视区内垂直居中浮动。组间分隔线 `.toolbar-divider` 由“竖线（宽 1px 高 22px）”改为“横线（宽 100% 高 1px）”。
- **为什么**：贴左缘且居中，既利用横向富余空间，又不压住页面视觉重心；浮动（非固定布局列）保持与现有“工具条不随内容滚动、不进入导出”一致。
- **备选**：顶对齐（`top: 12px`）——被否，竖条贴顶会与页面顶部内容争抢视觉起点；改固定左列（改 `.main` 网格）——被否，会让工具条成为布局列、遮挡判断与“浮动”语义，改动面更大。

### D2. 图标用内联 SVG
静态动作按钮（新增/删页、添加文字/图片、缩小/放大/适应窗口）在 `index.html` 内联 `<svg>`（`aria-hidden="true"`），按钮保留 `aria-label` 作为可访问名与提示文案来源。
- **为什么**：纯图标条需要一致、可缩放、跨平台渲染稳定的图形；内联 SVG 零依赖、`file://` 可用，比 Unicode/emoji（各 OS 渲染不一致、难以对齐）更适合图标化。
- **备选**：继续用 Unicode（＋/🗑/−）——被否，emoji 在不同系统外观差异大且难与 28px 图标网格对齐；引入图标字体/库——违反零构建零依赖约束。

### D3. JS 管理浮动提示，文案取 `aria-label`，显示在按钮右侧
新增一个轻量提示控制器：对工具条内按钮监听 `mouseenter`/`focusin` 显示、`mouseleave`/`blur` 隐藏，带约 150ms 显示延时；提示文案直接读取该按钮的 `aria-label`（单一来源，不再依赖 `title`，避免与系统原生提示叠加）；因工具条贴左缘，提示定位在按钮右侧，避免被视口左缘裁切。移除现有 `title` 属性。
- **为什么**：用户明确要求“浮动提示”（自定义、可控），原生 `title` 出现慢、不可样式化、位置不可控；贴左缘时提示必须在右侧，需要 JS 定位。
- **备选**：纯 CSS `::after + attr(data-tip)`——可行但焦点可达性、延时与防裁切控制较弱；`title`——不满足“浮动”且会双提示。

### D4. `chromeTop` 改为 `chromeLeft`（水平偏移）
把 `toolbarChromeTop()` 换为 `toolbarChromeLeft()`，返回 `工具条宽度 + 24`。适配逻辑相应调整：
- `measureCanvas()`：不再扣减高度，改为 `availableWidth = viewport.width - chromeLeft`，`fitScale` 取 `(availableWidth - 2·pad - 1)/pageW` 与 `(viewport.height - 2·pad - 1)/pageH` 的较小值。
- `syncGeometry()`：`contentW = pageW·scale + chromeLeft + 2·pad`；`contentH = pageH·scale + 2·pad`（去掉 `chromeTop`）；`originX` 在横向滚动时为 `chromeLeft + pad`，居中时为 `chromeLeft + (viewport.width - chromeLeft - pageW·scale)/2`；`originY` 去掉 `chromeTop`，纵向按 `pad`/居中处理。
- **为什么**：竖条占的是左侧水平空间，页面内容必须在竖条右侧排布，偏移方向从“顶部高度”变为“左缘宽度”，否则竖条会遮住页面左侧。
- **备选**：让竖条半透明浮在页面上、不预留空间——被否，会遮挡可编辑区，违背“动作始终可操作、不遮挡可编辑区”。

### D5. 缩放组纵向排布 + 紧凑百分比框
缩放组（`−` / `%` 输入框 / `＋` / 适应窗口）随竖条纵向堆叠；“适应窗口”文字按钮改为图标 + 提示；`%` 文本框保留可编辑数值，但收窄为约 44px 居中，以适配约 56px 宽的竖条。
- **为什么**：控件行为（可编辑百分比、范围 10%–400%、适应窗口）由 `canvas-view` 规格约束且不变，只随条改朝向；56px 宽足以容纳 28px 图标网格与 44px 输入框。
- **备选**：把百分比改成旋转标签或去掉输入框——被否，会破坏 `canvas-view` 的“百分比以可编辑数值形式显示”。

### D6. 页签竖向滚动区 + 数字图标
`.page-tabs` 由横向滚动改为竖向：`.canvas-toolbar-pages` 设为 `flex: 1 1 auto; min-height: 0`，`.page-tabs` 为 `overflow-y: auto; min-height: 0` 的纵向可滚区；新增/删页图标位于页签下方、始终可见。页签由“第 N 页”文字改为数字（1/2/3…）图标，当前页高亮，悬停/焦点提示“第 N 页”。`ui.renderPageTabs()` 据此改渲染（保留 `data-page-id`、`role="tab"`、`aria-selected`）。
- **为什么**：竖条高度有限，页数多时页签需纵向滚动；数字最紧凑且与“纯图标 + 提示”风格一致（用户已选定）。
- **备选**：保留“第 N 页”文字竖排——被否（用户已选数字图标），文字竖排占高更多。

## Risks / Trade-offs

- [竖条占 56px 水平空间，窄画布下可用宽度更小] → 页签区纵向滚动、`chromeLeft` 预留保证不遮挡；`fitScale` 按 `availableWidth` 收缩，页面仍完整可见。
- [提示控制器需处理焦点/移开、多按钮快速移动导致的残留提示] → 显示延时 + 单一活动提示元素 + `mouseleave`/`blur`/`focusout` 统一清理。
- [移除 `title` 后若某处依赖原生提示] → 全量改用提示控制器承载文案，`aria-label` 保证可访问名不变。
- [`originX/originY` 偏移方向变更可能影响命中/选择框对齐] → `canvas-view` 已要求坐标一致，改动后需在浏览器手动校验点击/拖动/手柄对齐。
- [内联 SVG 与现有 28px 图标网格的对齐] → 统一 `viewBox`/`width/height` 与按钮内 `inline-flex` 居中。

## Migration Plan

- 单文件静态应用，无数据迁移；改动限于 `index.html` / `style.css` / `js/ui.js` / `js/app.js`（及 `DESIGN.md` 描述）。
- 回滚策略：按文件 `git revert` 本次提交即可恢复原横向工具条；无持久化状态受影响。
- 验证：`file://` 打开页面，手动走一遍“导入 → 增删页/切换页 → 添加文字/图片 → 缩放/适应窗口 → 导出”，确认竖条贴左缘、图标悬停出提示、数字页签切换、页面不被竖条遮挡、导出不含工具条。

## Open Questions

无（停靠侧边=左、页签形态=数字图标已由用户确认；其余实现细节可在 apply 阶段落地）。
