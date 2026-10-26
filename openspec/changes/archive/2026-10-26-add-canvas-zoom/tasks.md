# Tasks

## 1. 画布结构、样式与文档

- [x] 1.1 在 `index.html` 的 `#canvas-pane` 内加入 `#canvas-scroll` 与 `#canvas-stage`，把 `#leafer-view` 移入 stage；保持 `#canvas-toolbar`、`#overlay`、`#empty-hint` 为 pane 的兄弟节点。打开页面确认 DOM 层级正确，控制台无错误，页面仍能渲染。
- [x] 1.2 在 `style.css` 增加 `.canvas-scroll`（`position: absolute; inset: 0; overflow: auto`）和 `.canvas-stage`（`position: relative`）规则，把 `.canvas-pane` 的 `overflow` 保持为 `hidden`；确认 `#overlay` 覆盖可视区且不遮住滚动条，滚动条出现时可用鼠标拖动。
- [x] 1.3 在 `#canvas-toolbar` 插入缩放组：`#btn-zoom-out`、`#zoom-input`、`#btn-zoom-in`、`#btn-zoom-fit`，沿用 `.canvas-toolbar-group` / `.icon-btn` / `.btn.btn-sm`，用 1px 分隔线与插入组隔开；在 1440px 与窄窗口下确认工具条换行后所有控件仍可点击、不与页签重叠。
- [x] 1.4 为 `.canvas-scroll` 增加细滚动条样式（WebKit 与 Firefox 各一套），与页签滚动条视觉一致；把 `#overlay` 的尺寸逻辑改为跟随 `#canvas-scroll` 的可视区（不含滚动条），用 DevTools 确认 overlay 不覆盖滚动条热区。
- [x] 1.5 更新 `DESIGN.md` 画布一节：补充滚动容器、缩放控件位置、10%–400% 范围、“视图缩放不等于页面尺寸”和滚动条行为；复查文字与 “不要新增整行工具栏” 的既有规则不冲突。

## 2. 视图比例状态与几何

- [x] 2.1 扩展 `js/app.js` 的 `viewport`：增加 `mode`、`zoom`、`fitScale`、`clientWidth/clientHeight`、`scrollX/scrollY`；把 `computeViewport()` 拆成“测量 + 计算 fitScale/padding + 写 stage 尺寸”和“按当前 mode 决定有效 scale”。刷新页面确认默认仍按窗口适配并居中。
- [x] 2.2 实现 `syncGeometry()`：按 `contentW/H`、`stageW/H`、`originX/Y` 与 `scrollLeft/Top` 计算 `offsetX/Y`，写入 stage 尺寸与 `#leafer-view` 的 transform；在适应窗口模式下确认无滚动条、页面居中位置与改动前一致（截图对比）。
- [x] 2.3 在 `#canvas-scroll` 上监听 `scroll`，用 `requestAnimationFrame` 合并事件，只更新 `offsetX/Y` 并重绘 overlay；把页面放大到出现滚动条后拖动滚动条，确认页面移动流畅、overlay 中的选择框和参考线同步移动。
- [x] 2.4 处理滚动条引起的尺寸回环：写入 stage 尺寸后二次读取 `clientWidth/clientHeight` 再计算 origin/offset；把窗口从宽拖窄再拖宽，确认不出现滚动条闪烁、页面不偏移。
- [x] 2.5 把 `fit()` 改为“置 `mode = 'fit'`、滚动归零、重新适配”；在 200% 下点击适应窗口，确认回到完整居中显示且两个方向都无滚动条。

## 3. 缩放控件与输入

- [x] 3.1 在 `js/ui.js` 绑定 `#btn-zoom-out` / `#btn-zoom-in`：按 10 个百分点步进，manual 模式从当前比例或 fit 比例起步，限制在 10%–400%；连续点击确认比例按 10% 变化、页面即时重绘、百分比同步。
- [x] 3.2 实现百分比输入框：显示 `Math.round(scale * 100) + '%'`；Enter/blur 提交，去掉 `%`、clamp 到 10–400、非法输入还原，Escape 还原；输入 150 确认切到 150%，输入 600 确认被限制为 400%，输入文本确认回到原值。
- [x] 3.3 在到达 10% 与 400% 时禁用缩小/放大按钮并设置对应 `title`/`aria-disabled`；从适应窗口连续点击缩小，确认停在 10%（fit 比例低于 10% 时先抬到 10%），再连续放大确认停在 400%。
- [x] 3.4 绑定“适应窗口”按钮与比例输入的可访问名称；仅用键盘完成“缩小 → 输入 150 → 回车 → 适应窗口”，确认焦点顺序合理、输入框内快捷键不触发画布删除/取消逻辑。

## 4. 滚轮缩放、滚动与锚点

- [x] 4.1 在 `#canvas-pane` 上监听非 passive `wheel`：`Ctrl`/`⌘` 时 `preventDefault` 并按 1.08 倍率缩放，普通滚轮把 `deltaX/deltaY` 转发给 `#canvas-scroll`（`deltaMode === 1` 时换算为像素，Shift 走横向）；确认浏览器页面本身不缩放、页面可滚动。
- [x] 4.2 实现指针锚定：缩放前记录指针下的页面坐标，缩放后按 `origin + p * newScale - pointer` 计算滚动位置并 clamp；把指针放在某个歌名上 `Ctrl` + 滚轮放大，确认该歌名仍在指针附近；用按钮缩放时以可视区中心为锚点。
- [x] 4.3 验证滚动边界：在 400% 下滚到页面四角，确认能完整看到页面四条边和 PAD 内边距，不会滚出空白区域；缩回适应窗口后确认滚动位置归零。

## 5. 坐标一致性与编辑交互

- [x] 5.1 全量核对 `js/app.js` 中 `viewport.offsetX/offsetY`、`toScreen`、`toPage`、`pageScreenRect` 的使用点，确认滚动后命中测试、选择框、8 个缩放手柄、页边距手柄和列分隔手柄都按显示位置对齐；在 150% 且滚动到页面中部时逐项点击/拖动验证。
- [x] 5.2 验证行内文字编辑：在 200% 且滚动后双击分类名、歌名和自由文字，确认 textarea 出现在元素显示位置、`scale()` 与当前比例一致、字号和换行可读；编辑提交后 overlay 与页面位图都更新。
- [x] 5.3 验证拖拽换算：在 150% 下拖动分类块、拖列宽、拖页边距，确认位移与指针 1:1（不被缩放放大），数值按页面坐标更新；滚动后再重复一次。
- [x] 5.4 确认 `#empty-hint`、`#canvas-toolbar`、页签在滚动时不移动；在空页面上放大并滚动，确认提示仍在可视区中央，工具条始终可操作。
- [x] 5.5 验证空态与工具条的层级：放大后页面内容不应盖住工具条；滚动条位于 overlay 右侧/下方且可拖动；用 Chrome DevTools 的元素检查确认 overlay 尺寸等于 `#canvas-scroll` 的可视区。

## 6. 状态生命周期与集成回归

- [x] 6.1 验证比例生命周期：在 200% 下切换页面、选中元素、修改属性、重绘，确认比例保持；缩小窗口确认 manual 比例不变且滚动范围更新；切回适应窗口后拖窗口确认重新适配。
- [x] 6.2 验证页面尺寸变化：在 150% 下把页面宽高改为 1200×1600，确认属性面板数值正确、视图比例不变、滚动条范围随新尺寸变化；再把页面改回 1080×1920，确认仍为 150%。
- [x] 6.3 验证数据边界：在 200% 下保存项目并检查 JSON 无缩放字段；重新加载确认默认适应窗口；在 200% 下导出 PNG，确认导出尺寸与 100% 时一致、不含滚动条/工具条/参考线。
- [x] 6.4 浏览器实测（Chrome，`file://` 或 `agent-browser`）：走一遍导入歌单 → 拖入分类 → 缩放/滚动 → 编辑 → 保存 → 加载 → 导出，确认无控制台错误；另在 Firefox 下确认滚动条与百分比控件可用（Leafer 不可用时回退 canvas 仍可缩放）。
- [x] 6.5 运行 `openspec validate add-canvas-zoom --strict`，确认 proposal/specs/design/tasks 全部通过；同时检查 `DESIGN.md` 与 `AGENTS.md` 的描述无冲突。

## 备注

- 6.4 备注：本机未安装 Firefox，已用 Chromium 完成完整流程与禁用 Leafer 的 canvas 回退验证；滚动条同时使用标准 `scrollbar-width`/`scrollbar-color` 与 WebKit 伪元素，Firefox 侧未实测。

## Workflow follow-up

- 使用 `/opsx-apply` 按本任务清单实施；实施完成并经项目审查后再归档该 change。
