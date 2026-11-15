# Tasks

## 1. 页面尺寸预设模型

- [x] 1.1 在 `js/model.js` 增加 `PAGE_SIZE_MIN`（320）、`PAGE_SIZE_MAX`（5000）、`PAGE_SIZE_PRESETS`（1080P/2K 横竖四项）与 `matchPageSizePreset(width,height)`，并从 `L.model` 导出；运行 `node --check js/model.js`，确认默认项目仍是 1080×1920。
- [x] 1.2 在 `scripts/checks/model.test.js` 覆盖四个预设的精确匹配、非匹配返回 `null`、宽高交换后匹配另一方向、范围常量与默认尺寸；运行 `node --test scripts/checks/model.test.js` 通过。

## 2. 尺寸写入与范围统一

- [x] 2.1 让 `js/app.js` 的 `setPageSize` 使用 `L.model.PAGE_SIZE_MIN/MAX`，保持只调用一次 `pushUndo('修改页面尺寸')`、取整后写入宽高并 `ui.renderAll()`；运行 `node --check js/app.js` 并检查函数内没有第二处范围字面量或第二次撤销。

## 3. 属性面板交互

- [x] 3.1 把 `js/ui-property-panel.js` 页面尺寸分组的两个固定按钮替换为预设 `<select>`、宽度输入、高度输入与交换按钮；保留现有 `prop-page-w`/`prop-page-h` 绑定；浏览器打开页面，确认下拉包含 1080P 竖屏、1080P 横屏、2K 竖屏、2K 横屏、自定义且默认选中 1080P 竖屏。
- [x] 3.2 实现下拉状态推导与绑定：匹配预设时选中该预设，否则显示 `自定义 当前宽×高`；选择预设调用一次 `setPageSize`，选择自定义只聚焦宽度输入且不隐藏输入，交换按钮调用一次 `setPageSize(height,width)`；两个输入使用 320–5000。浏览器验证：选 2K 竖屏后一次撤销回到 1080×1920；输入 1200×1800 后下拉显示自定义；再选“自定义”焦点落在宽度输入且无弹窗。
- [x] 3.3 调整 `style.css` 中页面尺寸分组的布局，使下拉、两个输入和交换按钮在窄属性面板内不溢出、不换行错位；浏览器缩窄窗口确认标签、下拉和输入仍可操作。

## 4. 集成验证

- [x] 4.1 浏览器验证全页与既有语义：两个页面下选择 2K 竖屏，确认两页都为 1440×2560、已放置元素坐标不变、`cover` 背景随页面回流、固定缩放不重置；导出对话框默认宽高为 1440×2560；在 2K 画布上拖动/缩放无卡顿。
- [x] 4.2 验证自定义与边界：打开一个 1200×1800 的项目，下拉显示 `自定义 1200×1800`；输入 6000 收敛为 5000、输入 100 收敛为 320；交换后下拉切到对应横屏预设；每次操作只产生一步撤销。
- [x] 4.3 运行 `node --test scripts/checks/*.test.js` 全部通过；运行 `./build.sh` 成功且 `dist/index.html` 的脚本版本参数正常；运行 `openspec validate "page-size-presets" --strict` 通过。

## Workflow follow-up

- 全部任务与评审完成后，通过 `/opsx-archive` 归档本变更，并按 OpenSpec 流程同步 `page-editor` 主规格。
