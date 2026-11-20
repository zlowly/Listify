# Tasks

## 1. render.js 色相滤镜助手

- [x] 1.1 在 `js/render.js` 的 `filterString` 附近新增 `hueFilter(item)`：用既有 `finiteOr(item.hue, 0)` 归一化，非 0 返回 `'hue-rotate(Ndeg)'`，0/缺失/非法返回空串，并在 `L.render` 导出对象中加入 `hueFilter`；验证：在 Node 中经 `scripts/checks/loader.js` 加载后断言 `L.render.hueFilter({ hue: 90 }) === 'hue-rotate(90deg)'`，且 `hueFilter({})`、`hueFilter({ hue: 0 })`、`hueFilter({ hue: 'abc' })` 均为 `''`
- [x] 1.2 新增 `scripts/checks/render.test.js`（参照 `model.test.js` 的 loader 用法）固化 1.1 的四组输入断言，并断言 `L.render.hueFilter` 已导出；验证：`node --test scripts/checks/render.test.js` 通过，且 `node --test scripts/checks/*.test.js` 全绿

## 2. 图层缩略图应用色相

- [x] 2.1 将 `js/ui.js` 的 `layerThumb(assetId)` 扩参为 `layerThumb(assetId, item)`：`L.render.hueFilter(item)` 非空时给 `<img class="layer-thumb">` 追加 `style="filter:…"`，两个调用点（内容图片行传 `element`、背景图片子行传 `item`）透传条目；`js/ui-property-panel.js` 的色相 `input` 绑定在写入后补 `ui.renderLayerPanel()`（属性写入只重绘画布，不重建图层行，内容与背景共用该绑定）；`index.html` 脚本顺序与 `style.css` 均不改动；验证：浏览器中把某张图片色相设为 90°，图层面板该行的缩略图与画布颜色一致，色相 0 的行无 `filter` 样式
- [x] 2.2 浏览器回归缩略图既有行为：资产缺失/加载失败仍回退 `▧`，行高、内边距、序号、「已裁剪」副标题与选择/上移下移/拖拽换序不受影响；验证：`agent-browser`（或手动）按 delta spec 的两个既有场景（内容图片行显示缩略图、缩略图不反映元素效果）走查通过

## 3. 集成验证

- [x] 3.1 全量回归：运行 `node --test scripts/checks/*.test.js` 确认无回归；验证：全部测试通过
- [x] 3.2 浏览器端到端走查 delta 新增场景：色相 90° 的行缩略图与画布一致（含背景图片子行）；色相改回 0 或打开无 hue 字段的旧项目时缩略图恢复/保持原图外观；验证：agent-browser（或手动）走查通过

## Workflow follow-up

- 评审通过后归档本变更：`openspec archive layer-thumb-hue`，并确认 `openspec/specs/editor-shell/spec.md` 中「图片行显示资产缩略图」需求已按 delta 更新。
