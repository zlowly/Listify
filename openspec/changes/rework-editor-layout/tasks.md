# Tasks

## 1. 重排 DOM 外壳

- [ ] 1.1 在 `index.html` 中把 `#btn-import` 从顶栏移到左侧分类视图的静态工具条，保留 id，并在旁边加入“或拖入 .txt”提示；打开页面确认按钮存在且顶栏不再有导入。
- [ ] 1.2 删除 `.page-strip` 整行，把 `#page-tabs`、`#btn-add-page`、`#btn-delete-page`、`#btn-add-text`、`#btn-add-image` 移入 `#canvas-pane` 内的 `#canvas-toolbar`；确认 `#canvas-pane` 的直接子节点包含工具条、`#leafer-view`、`#overlay`、`#empty-hint`。
- [ ] 1.3 在 `main` 内、`#canvas-pane` 之后新增 `<aside class="inspector">`，把 `#property-panel` 和 `#selection-label` 及其标题移入；确认页面只有一个 `#property-panel`，且不再位于 `.sidebar` 内。
- [ ] 1.4 顶栏只保留品牌、`#btn-save`、`#btn-load`、`#btn-export`；导出按钮改用 `btn-primary`；确认顶栏右侧只有三个动作。
- [ ] 1.5 给画布工具条补 `role="group"`/`aria-label`，给仅图标按钮补 `aria-label`，页签渲染时补当前页状态；用浏览器可访问性快照确认图标按钮有可读名称。

## 2. 三区布局与设计系统同步

- [ ] 2.1 在 `style.css` 中新增 `--inspector-w`，把 `.main` 调整为左栏 + 画布 + 右栏三列；`#canvas-pane` 保持 `flex: 1 1 auto; min-width: 0`；在 1440×900 下确认左栏 300px、右栏 320px、画布占剩余宽度。
- [ ] 2.2 新增 `.inspector` 全高样式：左边 1px 结构线、`#property-panel` 独立滚动、标题固定；确认长属性滚动时标题和画布不动。
- [ ] 2.3 新增左侧 `.panel-toolbar` 样式并让它只在分类视图显示；确认切到图层视图时导入按钮和提示隐藏，分类列表占满剩余高度。
- [ ] 2.4 新增 `.canvas-toolbar` 绝对定位样式（`top/left: 12px`、纸白底、1px 线、8px 圆角、无阴影、`max-width: calc(100% - 24px)`、允许换行）；确认它不再横贯整行，且页签多时只有页签区横向滚动。
- [ ] 2.5 删除 `.page-strip` 与旧 `.property-section` 规则，调整 ≤1180px 断点为 280px / 300px；在 1180×800 和 900×700 下确认左右栏收窄、画布不被挤成 0、界面不上下重排。
- [ ] 2.6 更新 `DESIGN.md`：Layout 改为顶栏 + 三列（左 300 / 中弹性 / 右 320），删除页签条；Components 增加 Canvas Toolbar、把 Property Inspector 改为右侧检查栏、把 Page tab 描述改为画布工具条内；Named Rules 的 Fixed Frame Rule 改为“不新增整行工具栏”。用 `grep` 确认 `DESIGN.md` 不再把属性面板描述为侧栏下方、不再保留 42px 页签条。

## 3. 交互绑定与文案

- [ ] 3.1 在 `js/ui.js` 中把 `#btn-import` 的绑定迁到新的分类工具条位置（id 不变则无需改选择器），确认点击打开文件选择器、选择 txt 后导入流程与原来一致。
- [ ] 3.2 在 `ui.setPanel()` 中同步 `#category-toolbar` 的显隐；确认分类/图层切换时导入入口只随分类视图出现，分类面板拖放仍可用。
- [ ] 3.3 确认 `#page-tabs` 的渲染和点击仍工作，并在当前页按钮上加 `aria-current="page"`（或 `role="tab"` + `aria-selected`）；确认新增/删除页按钮仍调用原有流程。
- [ ] 3.4 确认 `#btn-add-text`、`#btn-add-image` 移到画布工具条后仍调用 `L.app.addText()` / `L.app.pickFreeImage()`；手动添加文字和图片各一次，确认元素出现在当前页。
- [ ] 3.5 更新分类空态为“点击上方‘导入歌单’，或把 .txt 文件拖到这里”，更新画布空态为“从左侧导入歌单，再把分类拖到页面上”；确认无歌单、无内容两种状态都显示新文案。

## 4. 画布适配与工具条避让

- [ ] 4.1 在 `js/app.js` 的 `computeViewport()` 中读取 `#canvas-toolbar` 高度，按 `toolbarHeight + 24` 预留顶部空间，并用剩余高度计算缩放和垂直居中；工具条不存在时回退为 0。在 1440×900 下确认页面顶部不与工具条重叠。
- [ ] 4.2 在 900×700 下确认工具条换行后高度增加，页面仍居中在工具条下方，页签、增删页、添加文字/图片全部可点击；窗口 resize 后再次确认位置更新。
- [ ] 4.3 确认工具条和页签不进入导出：导出当前页 PNG，检查图片中没有工具条、页签、按钮或工作台背景。

## 5. 集成走查

- [ ] 5.1 在 1440×900 走完整流程：左侧导入 `samples/` 中的歌单 → 切页/新增页 → 添加文字 → 添加图片 → 把分类拖入页面 → 选中页面/分类块/图层并确认右侧属性同步 → 修改页面尺寸和边距。确认所有入口位置符合三区布局。
- [ ] 5.2 在 1180×800 和 900×700 重复关键路径（导入、切页、添加文字、拖动分类、属性滚动、导出），确认没有横向溢出、控件重叠或属性面板被裁切。
- [ ] 5.3 用 `agent-browser` 截图三个尺寸，按“画布是主体、左素材、右检查、顶栏退后”的层级检查；确认没有新增阴影、渐变或第二个强调色，画布工具条保持纸白 + 1px 边框。

## Workflow follow-up

- 归档变更前确认 `openspec validate rework-editor-layout --strict` 通过。
- 按项目评审要求归档该变更，并验证归档后的主 spec 包含 `editor-shell`。
