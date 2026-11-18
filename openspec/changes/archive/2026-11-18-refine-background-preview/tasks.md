# Tasks

## 1. 渲染辅助

- [x] 1.1 在 `js/render.js` 把背景绘制体抽成 `paintBackground(ctx, pageSize, background, options)`，`drawBackground` 改为先取 `model.effectiveBackground` 再调用它；导出 `paintBackground`。验证：`node --test scripts/checks/*.test.js` 全绿，浏览器中画布背景与导出 PNG 和改动前一致。
- [x] 1.2 新增 `render.paintBackgroundPreviews(root)`：查找 `[data-preview-page]` 的 canvas，按 `clientWidth/clientHeight`（DPR 上限 2，未布局时用 72x96 / 40x52 逻辑尺寸）设置位图，等比缩放居中后对 `page.background` 调用 `paintBackground`。验证：页面面板出现缩略图 canvas，横竖版页面都完整显示且无裁切。

## 2. 属性面板与复制弹窗

- [x] 2.1 改 `js/ui-property-panel.js` 的 `backgroundPreview` 输出 `<canvas class="bg-preview" data-preview-page="<pageId>">`，在 `renderPropertyPanelBody` 写入 DOM 后调用 `paintBackgroundPreviews`；保留「本页背景（不显示） · N 张图」文案。验证：浏览器中多图背景缩略图显示叠放结果，被全局覆盖的页仍显示本页背景。
- [x] 2.2 改 `js/ui-pickers.js` 的 `previewOf` 使用同一 canvas 预览，弹窗内容写入后调用 `paintBackgroundPreviews`。验证：打开「复制背景…」，每一页预览显示该页填充色与全部图片的合成结果。
- [x] 2.3 调整 `style.css`：`.bg-preview` 保留固定外框，内部 canvas 宽高 100%，删除 `.bg-preview img` 的 `object-fit: cover` 规则。验证：横版页面预览上下留边、内容不裁切；属性面板与弹窗布局不跳动。

## 3. 移除页面级无效删除控件

- [x] 3.1 删除 `js/ui-property-panel.js` 中 `renderPageProperties` 末尾的 `propGroup('actions', …)` 及其对 `prop-delete-block` 的引用。验证：选中页面时面板底部不再出现禁用按钮；选中分类块时删除按钮仍可用并执行删除。

## 4. 集成验证

- [x] 4.1 运行 `node --test scripts/checks/*.test.js`，确认全部通过且没有新增跳过项。
- [x] 4.2 浏览器手动走查（可用 `agent-browser`）：填充色 + 单图 cover、多图叠放、none 定位拖动、透明度/模糊/亮度/色相/渐隐/旋转、替换与删除、页面尺寸切换、清空背景、复制背景弹窗、全局背景覆盖页，确认缩略图与画布一致且松手后更新。
- [x] 4.3 确认零构建约束未变化：`index.html` 未新增脚本，未引入构建或依赖，`js/dev-checks.js` 仍未在页面加载。
