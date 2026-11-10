# Tasks

## 1. 工具条竖向布局（index.html + style.css）

- [x] 1.1 重排 `index.html` 中 `#canvas-toolbar` 的分组结构为竖向三段（页面组 / 插入组 / 缩放组），保留全部按钮 id 与事件绑定目标不变；浏览器打开页面验证各按钮 id 仍可绑定、点击行为不丢
- [x] 1.2 改 `style.css`：`.canvas-toolbar` 设为 `flex-direction: column`、约 56px 宽窄条，贴画布可视区左缘并垂直居中（`left:12px; top:50%; transform:translateY(-50%)`），`.toolbar-divider` 改为横线（宽 100% 高 1px）；浏览器验证竖条贴左缘、纵向排布、不推动画布整体右移
- [x] 1.3 改 `style.css`：`.canvas-toolbar-pages` 设 `flex:1 1 auto; min-height:0`，`.page-tabs` 改纵向滚动区（`overflow-y:auto; min-height:0`），缩放组纵向堆叠并把 `zoom-input` 收窄为约 44px 居中；浏览器多建几页验证页签区竖向滚动、新增/删页/插入/缩放动作始终可见

## 2. 图标化与浮动提示

- [x] 2.1 将 7 个动作按钮（新增页、删除页、添加文字、添加图片、缩小、放大、适应窗口）改为内联 SVG 图标（`aria-hidden="true"`），保留各自 `aria-label`；浏览器验证图标在 28px 网格内居中、可访问名正确
- [x] 2.2 实现轻量浮动提示控制器：`mouseenter`/`focusin` 显示（约 150ms 延时）、`mouseleave`/`blur`/`focusout` 隐藏，文案读取按钮 `aria-label`，定位在按钮右侧；移除原 `title` 属性；浏览器验证悬停/键盘焦点时在按钮右侧出现提示、移开即消失、快速切换按钮无残留、焦点可达
- [x] 2.3 确认“添加图片”按钮提示文案包含“也可直接 Ctrl+V 粘贴”说明；浏览器悬停验证该提示完整显示

## 3. 数字图标页签（js/ui.js）

- [x] 3.1 改 `ui.renderPageTabs()` 渲染为数字图标页签（显示 1/2/3…，保留 `data-page-id`、`role="tab"`、`aria-selected`，当前页高亮，提示文案为“第 N 页”）；浏览器验证点击数字页签切换页面、当前页高亮、悬停提示“第 N 页”

## 4. 画布适配改为左缘水平偏移（js/app.js）

- [x] 4.1 将 `toolbarChromeTop()` 改为 `toolbarChromeLeft()`（返回工具条宽度 + 24），`measureCanvas()` 改为按 `availableWidth = viewport.width - chromeLeft` 计算 `fitScale`；浏览器验证“适应窗口”比例按竖条右侧宽度收缩、页面完整可见
- [x] 4.2 改 `syncGeometry()`：`contentW = pageW·scale + chromeLeft + 2·pad`、`contentH` 去掉 `chromeTop`，`originX` 横向滚动时为 `chromeLeft + pad`、居中时在竖条右侧区域内居中，`originY` 去掉 `chromeTop`；浏览器验证页面不被竖条遮挡、点击/拖动/选择框/手柄与页面实际位置对齐

## 5. 集成验证与文档

- [x] 5.1 `file://` 打开整站走查：导入歌单 → 增删/切换页 → 添加文字/图片 → 缩放/适应窗口 → 导出 PNG；逐条核对 `editor-shell` delta 场景（贴左缘竖条、图标悬停出提示、数字页签切换、页签过多竖向滚动、窄/矮画布不遮挡、导出不含工具条）
- [x] 5.2 更新 `DESIGN.md` 中画布工具条位置、形态与图标/浮动提示约定；核对文档描述与实际实现一致

## Workflow follow-up

- 实现并验证完成后，运行 `openspec archive vertical-canvas-toolbar` 归档该 change（将 delta 合入 `openspec/specs/editor-shell/spec.md`）。
- 归档后运行 `openspec list --specs` 与浏览器复查，确认 `editor-shell` 主 spec 已反映竖向工具条要求。
