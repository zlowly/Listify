# Proposal

## Why

现在的背景是“每页一张图 + 页面引用组”：`page.background` 只能放一张图，跨页共享必须依赖某一个所有者页面，删除所有者还要把引用页物化。这个模型无法表达“背景由多张图叠加组成”，也无法让不相邻的页面直接复用同一套背景；用户只能每页重复添加相同的图片。

需求文档里还留着一个未实现的“主标题”文字项，本次不处理，避免把背景改造和文字排版混在一起。

## What Changes

- 把“每页一张背景图 + backgroundRef”改为项目级背景库：`project.backgrounds[]`，每项包含 `id/name/color/images[]`；页面只存 `page.backgroundId`。
- 每个背景支持多张有序图片；每张图独立支持 `original/fill-width/fill-height/cover/none` 五种定位、透明度、模糊；`none` 支持 x/y/宽高/旋转/等比锁定；填充色属于背景集。
- 背景层仍是独立层，不进入 `page.elements`；内容永远在上；仅歌单层导出跳过整个背景层。
- 增加非破坏性的全局背景模式：`project.unifiedBackground` + `unifiedBackgroundId`，开启时所有页渲染全局背景，各页 `backgroundId` 保留；关闭后恢复。提供“固化到所有页”和“本页独立副本”避免取消时的意外回退。
- 增加背景库管理：新建空白、复制、重命名、删除、引用页数；删除被引用/全局/最后一个背景被阻止；删除后释放未引用资产。
- 背景图可从图层面板选中后在画布拖拽/缩放/旋转；正常内容编辑时背景不命中；直接操作 fit 图自动转 `none` 并烘焙矩形，可“恢复为最适合”。
- 新增页直接继承当前有效背景，移除“空白/引用上页”对话框。
- 持久化版本升到 3：保存整个背景库（含未使用背景）和资产；v1/v2 自动迁移；v2 引用组折叠为背景，v1 每页各自成为背景。
- 更新 `PRODUCT.md`、`docs/歌单生成器需求.md` 和 `AGENTS.md`；把“主标题”标为后续未实现。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `background-layer`: 背景库、多图组合、每图定位/透明度/模糊、全局模式、背景库管理、背景编辑、读取失败。
- `project-persistence`: 版本 3、背景库保存/加载、每页 backgroundId、全局字段、资产范围、v1/v2 迁移、资源缺失。
- `page-editor`: 多页管理的背景继承/删除、新页背景来源、背景层与图层面板、背景不参与溢出。
- `canvas-view`: 背景编辑状态下的命中、选择框、手柄与缩放/滚动坐标一致。
- `editor-shell`: 图层背景组/子行、背景集/图片属性面板、页面背景区、背景库弹窗、新增页流程。

`png-export` 不新增 delta：本页/所有页、完整/透明模式已由进行中的 `add-export-options` 覆盖；本次只改变“背景”的内部组成，导出继续按“完整页面包含有效背景全部图片、仅歌单层跳过整个背景层”执行，避免与未归档变更修改同一需求。

## Impact

- 代码：`js/model.js`、`js/render.js`、`js/io.js`、`js/app.js`、`js/ui.js`、`js/export.js`、`style.css`；不新增脚本或依赖。
- 数据：项目 JSON 版本 3；新增 `backgrounds`、`unifiedBackground`、`unifiedBackgroundId`；页面新增 `backgroundId`，移除 `background`/`backgroundRef`。
- 兼容：v1/v2 可加载并迁移；保存只写 v3；旧版本应用会拒绝 v3 并提示版本不支持。
- 规范/文档：上述 5 份 spec delta；`PRODUCT.md`、`docs/歌单生成器需求.md`、`AGENTS.md`。
- 约束：零构建、`file://`、Chrome、无网络、无新依赖不变。
