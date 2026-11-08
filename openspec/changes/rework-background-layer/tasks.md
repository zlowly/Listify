# Tasks

## 1. 数据模型与默认项目

- [x] 1.1 在 `js/model.js` 增加背景集/背景图片工厂：`createBackgroundSet(name, color)`、`createBackgroundImage(assetId, fit)`、`cloneBackgroundSet(set)`；图片字段包含 `id, assetId, fit, x, y, width, height, rotation, keepRatio, opacity, blur`；验证：控制台创建/克隆后字段完整，克隆的 ID 不同、assetId 相同。
- [x] 1.2 把 `createDefaultProject` 改为版本 3：创建一个空白背景集，页面写入 `backgroundId`，项目写入 `unifiedBackground:false`、`unifiedBackgroundId:null`；验证：刷新后页面仍为白色，背景库有 1 项。
- [x] 1.3 用 `effectiveBackground(project, page)`、`backgroundReferenceCount(project, setId)`、`canDeleteBackground(project, setId)` 替换运行时对 `resolveBackgroundOwner` / `referencingPages` 的使用；迁移代码可保留旧 helper；验证：全局/非全局下有效背景解析正确。
- [x] 1.4 改造 `createPage` 接收 `backgroundId`；删除运行时对 `background` / `backgroundRef` 的读写；验证：新增/删除/切换页面不产生旧字段。

## 2. 背景渲染与命中

- [x] 2.1 在 `js/render.js` 实现 `backgroundImageRect(pageSize, image, asset)`：fit 模式复用 `backgroundGeometry`，`none` 用图片自身矩形与旋转；验证：五种模式的矩形与预期一致。
- [x] 2.2 重写 `drawBackground`：先填充颜色，再按 `images` 顺序逐张绘制；每张应用 opacity/blur/rotation，整体裁剪到页面，不按单图矩形裁剪；验证：两张图叠加、透明、模糊、页面裁剪正确。
- [x] 2.3 让 `drawPage` 使用 project/page/pageSize，完整页面导出包含全部背景图；仅歌单层复用 `includeBackground:false` 跳过整层；验证：完整 PNG 有两张图，透明 PNG 无背景。
- [x] 2.4 增加 `hitTestBackground(project, page, point, pageSize)`，逆序命中旋转矩形；只在背景编辑状态调用；验证：旋转自定义图点击可见区域命中，空白不命中。
- [x] 2.5 更新 `pageAssets(project, page)` 返回有效背景全部图片资产 + 内容图片资产；增加 `allBackgroundAssets(project)`；验证：未分配给页面的背景资产也能被列出。

## 3. 持久化与迁移

- [x] 3.1 `js/io.js` 的 `serializeProject` 写版本 3：`backgrounds`、`unifiedBackground`、`unifiedBackgroundId`、页面 `backgroundId`；不再写 `background`/`backgroundRef`；保存所有背景资产（含未使用背景）；验证：保存含未使用背景的项目，JSON 含该背景和资产。
- [x] 3.2 增加 v3 校验：背景至少 1 个、ID 唯一、名称/颜色/图片字段、fit 五值、`none` 的 x/y/w/h/rotation、opacity/blur、page.backgroundId、全局 ID、资产存在；验证：逐项构造坏数据，均报错且不替换当前项目。
- [x] 3.3 实现 v2→v3 迁移：按 `resolveBackgroundOwner` 分组，每组生成一个背景，组内页面写同一 `backgroundId`；旧背景的 color/fit/opacity/blur 写入；全部页面同组时 `unifiedBackground=true`，否则 false；验证：v2 引用组加载后仍同步，非引用页保持独立。
- [x] 3.4 复用现有 v1→v2 迁移后再 v2→v3；v1 每页生成独立背景，`unifiedBackground=false`；验证：v1 项目加载后每页外观不变，编辑一页背景不影响其它页。
- [x] 3.5 版本常量改为 3，接受 1/2/3，拒绝其它；更新加载错误提示；验证：版本 4 和 0 均被拒绝。
- [x] 3.6 往返验证：保存 v3 后重新加载，背景库名称/颜色/图片顺序/每图 fit/自定义矩形/旋转/等比/透明度/模糊、page.backgroundId、全局开关/ID、未使用背景均一致；验证：用含 2 个背景、3 张图、1 个未使用背景的项目往返。

## 4. 背景库与全局模式操作

- [x] 4.1 实现背景集 CRUD：新建空白、复制、重命名、删除；删除前检查 `canDeleteBackground`，阻止被引用/全局/最后一个；删除后释放未引用资产；验证：被引用时提示页数，未使用时删除成功，最后一个被阻止。
- [x] 4.2 实现背景图片 CRUD：添加（空背景默认 cover，非空默认 original 居中）、替换（保留定位/透明度/模糊/顺序）、删除、上移/下移；替换/删除后释放未引用资产；验证：添加两张图默认 fit 正确，替换后几何不变，排序影响绘制。
- [x] 4.3 实现全局开关：开启时记住/使用 `unifiedBackgroundId`，无效则用当前页有效背景；关闭保留 ID；全局下拉切换立即重绘所有页；验证：开启/关闭/再开启仍回到记住的背景。
- [x] 4.4 实现“固化到所有页”：所有页 `backgroundId=unifiedBackgroundId`，关闭全局；实现“本页独立副本”：复制全局背景给当前页，其它页写全局 ID，关闭全局；验证：固化后所有页外观不变；副本页编辑不影响其它页。
- [x] 4.5 新增页继承当前有效背景；全局模式下写全局 ID；删除页不再物化背景；切换页清除选择；验证：新增/删除/切换后背景引用和引用计数正确。

## 5. 画布选择与编辑

- [x] 5.1 扩展选择状态为背景集/背景图：`{type:'backgroundSet', setId}`、`{type:'backgroundImage', setId, imageId}`；图层组行/子行与画布点击都能设置；验证：属性面板标题与选中对象一致。
- [x] 5.2 背景编辑状态：正常模式不命中背景；选中背景后命中背景图并显示手柄；内容命中优先；Escape/页面标签清除选择；验证：空白处仍能选页面，点内容切回内容，Esc 回页面。
- [x] 5.3 复用内容图片的拖拽/缩放/旋转/等比逻辑到背景图；对 fit 图直接操作自动转 `none` 并烘焙矩形；属性面板提供“恢复为最适合”；验证：拖动 cover 图后 fit 变 none、页面尺寸变化不重排；点恢复后重新 cover。
- [x] 5.4 处理缩放/滚动后的坐标：背景图命中、选择框、手柄与内容使用同一变换；验证：200% + 滚动后拖动/旋转背景图，落点与手柄对齐。
- [x] 5.5 页面边界/溢出：背景图不进入 `pageOverflow`，自定义背景超出页面不显示警告；验证：背景超出时只裁剪，内容溢出仍警告。

## 6. 图层与属性面板

- [x] 6.1 `js/ui.js` 图层面板：内容行在上、背景组在下；组行显示名称、全局标记、引用页数；子行显示缩略图、fit/自定义标记；点击组行/子行选中；验证：两页不同背景切换后列表更新，全局模式显示同一背景。
- [x] 6.2 背景集属性面板：名称、填充色、引用/全局状态、添加图片、复制、重命名、删除、管理背景库；全局时显示“固化到所有页”“本页独立副本”和影响所有页提示；验证：各按钮行为与规范一致。
- [x] 6.3 背景图属性面板：fit 五选一、透明度、模糊、自定义 x/y/宽高/旋转/等比、上移/下移、替换、删除、恢复为最适合；验证：切换 fit 与自定义字段显隐正确，修改即时重绘。
- [x] 6.4 页面属性面板增加“当前页背景”下拉（全局时禁用并提示）、全局开关、全局背景下拉、管理背景库按钮；验证：全局开关/下拉/页面下拉三者联动正确。
- [x] 6.5 背景库弹窗：列出背景、引用页数、全局标记；新建/复制/重命名/删除；删除被引用/全局/最后一个时提示；验证：弹窗操作后页面引用不被意外改变。
- [x] 6.6 `style.css` 补图层缩进、组行/子行、全局徽标、弹窗列表样式；验证：1280 宽和窄窗口不溢出，视觉与现有面板一致。

## 7. 导出与资产

- [x] 7.1 `js/export.js` 的完整模式加载并绘制有效背景全部图片；仅歌单层跳过整层；验证：2 图背景完整导出包含两图，透明导出不含背景。
- [x] 7.2 预加载按 `pageAssets(project, page)` 取图；未使用背景的资产在保存时保留；验证：导出不因未使用背景缺图失败；保存含未使用背景的项目资产完整。
- [x] 7.3 更新 `assetIsReferenced` 扫描所有背景集；替换/删除图片/背景后 `releaseUnusedAsset` 正确释放；验证：删除唯一引用后资产消失，仍有引用时保留。

## 8. 文档与验证

- [x] 8.1 更新 `PRODUCT.md` 能力/工作流：背景库、多图组合、每页背景、全局模式、画布编辑。
- [x] 8.2 更新 `docs/歌单生成器需求.md` 背景章节：多图、fit/自定义、全局模式、背景库、迁移；把“主标题”标为后续未实现。
- [x] 8.3 更新 `AGENTS.md` 的背景领域规则：每图 fit + 自定义、背景库、背景不在 page.elements、内容优先/背景编辑状态。
- [x] 8.4 用 `agent-browser` 打开 `index.html`（file://）走完整流程：导入 v2 样例→迁移检查→加两张背景图→fit/自定义→全局开/关/固化/副本→新增/删除页→保存/重新加载→完整/透明导出；记录控制台错误与截图。
- [x] 8.5 运行 `openspec validate rework-background-layer --strict`，修正所有 delta 格式/需求冲突；确认与 `add-export-options`、`add-table-margins` 无 spec 冲突。
