# Tasks

## 0. 实施前基线校准

- [x] 0.1 重新对齐基线：确认自 `0ffccf6` 以来的功能提交（`f5d2ea4` 选中优先抓取/方向键微调、`5a0acc0` 旋转光标）新增的函数都已落在下文某个模块归属内（`selectedElementAt`、`nudgeSelection`、`refreshHoverCursor`、`handleCursor`、`normalizeCursorAngle`、`resizeCursorKeyword`、`rotatedCursorSvg`、`onPointerLeave`）。验证：本文件的模块边界以函数名描述，`grep -n "function <函数名>"` 能逐个定位；若出现新函数未列在任何任务中，先补归属再开工，禁止留在未归属区。

## 1. 回归安全网（先做，后续每一步都依赖它）

- [x] 1.1 新建 `scripts/checks/loader.js`：用 Node 内置 `vm` 创建沙箱，注入最小 `window`（`Listify` 命名空间、`devicePixelRatio`、`crypto`）与 `document` 桩，按 `index.html` 顺序加载运行时脚本并返回 `window.Listify`。`document.createElement('canvas')` 必须返回带确定性 `getContext('2d')` 的假 canvas：颜色探测（`model.js` 的 `supportsColorMix` 守卫）与 `layout.js` 加载时创建的 `measureCanvas` 都依赖它，`measureText` 用固定规则（如 `virtualWidth(text) * fontSize * 0.6`）。验证：加载后 `L.model`、`L.layout`、`L.io` 均存在；不依赖 npm 与网络。
- [x] 1.2 新建 `scripts/checks/model.test.js`：覆盖 `virtualWidth`（ASCII/CJK/全角/emoji）、`sortSongs` 稳定性、字体栈 `normalizeFontStack` 与 `quoteFamily`、`normalizeMargins`、`clone` 深拷贝。验证：`node --test scripts/checks/model.test.js` 全部通过。
- [x] 1.3 新建 `scripts/checks/layout.test.js`：用 1.1 的确定性 `measureText` 作为基线（不要覆盖 `L.layout.measureText` 导出：内部调用走闭包，覆盖无效），覆盖列宽、`assignTableSongs` 的列优先/行优先、动态行数、满页续表与空表占位。验证：断言结果与当前手工基线一致；改动前先记录期望值。
- [x] 1.4 新建 `scripts/checks/io.test.js`：覆盖 `serializeProjectStructure` 往返、`validateProject` 的版本/重复 ID/缺失资产/无效 fit 等错误分类、`createDraftEnvelope` 不含 base64。验证：合法项目零错误，非法样本返回预期错误消息。
- [x] 1.5 新建 `scripts/checks/zip.test.js`：覆盖本地文件头、中央目录、CRC32、空目录与多文件条目。验证：解压产物可被 `unzip -t` 校验通过（若本机无 `unzip`，用 Node 解析目录结构断言）。
- [x] 1.6 在 `scripts/README.md` 增加「回归检查」一节：说明 `node --test scripts/checks/*.test.js` 的用途、零依赖约束、覆盖边界（不含 canvas 绘制/交互/IndexedDB）。验证：文档命令可直接执行通过。

## 2. P0 清理

- [x] 2.1 将 `js/layout.js` 的 `devChecks()`（约 520-872 行）迁到 `js/dev-checks.js`，暴露 `L.devChecks()`；同时删除 `js/layout.js` 的导出与 `js/app.js` 末尾的 `L.devChecks` 转发包装（当前约 3085-3087 行，只搬 layout 侧会留下指向已删除函数的死链）；`index.html` 不引用该文件。验证：`./build.sh` 后 `dist/` 不含 `js/dev-checks.js`；浏览器手动注入该脚本后可运行 `L.devChecks()`。
- [x] 2.2 `build.sh` 在 `copy_tree js` 阶段**排除** `js/dev-checks.js`（拷贝时跳过；若采用「先全量拷贝再断言」，则每次构建都会因源码存在该文件而失败），并在 `assert_dist_clean()` 中断言产物不含该文件，命中即失败并指明。验证：源码存在 `js/dev-checks.js` 时 `./build.sh` 成功且产物无该文件；手工 `cp` 该文件进 `dist/` 后重跑清洁检查逻辑，确认失败退出。
- [x] 2.3 工具去重：删除 `js/app.js` 的本地 `clamp`（约 133 行），改用 `model.clamp`；`js/app.js:76/78` 与 `js/io.js:490` 的 JSON 深拷贝改用 `model.clone`；`js/app.js:2510` 的 `escapeHtml` 与 `js/ui.js:16` 的 `esc` 语义完全相同，收敛为单一实现（`util` 或 `ui.esc`，`app` 侧复用）；下载统一走 `model.downloadBlob`（`io.js:190`、`playlist-export.js:40` 已符合，无需改）。验证：`grep -n "function clamp" js/*.js` 仅 `model.js` 一处；全仓 HTML 转义正则 `[&<>"']/g` 仅一处实现；`node --test` 通过；手工导出项目 JSON 正常。
- [x] 2.4 版本标识：`build.sh` 在 `inject_version` 后注入 `js/app.js` 的 `BUILD`（或删除常量改为注入 `window.LISTIFY_BUILD`）。验证：把 `VERSION` 改为临时值构建后，`dist/index.html` 的 `?v=` 与 `dist/js/app.js` 的 `BUILD` 一致；源文件不被修改。
- [x] 2.5 更新 `AGENTS.md`：记录「自检文件不进产物」「工具函数唯一实现」「BUILD 由构建注入」三条约定。验证：文档与脚本行为一致。

## 3. 拆分 `js/io.js`

- [x] 3.1 新建 `js/project-schema.js`：迁入 `isFiniteNumber`、`validateProject`、`migrateLegacyBackgrounds`、`buildBackgroundSet`、`ownerPage`。`js/io.js` 改为引用；`index.html` 在 `model.js` 后、`io.js` 前声明。验证：`dist` 构建成功；导入旧版项目 JSON 的迁移结果与拆分前一致（用样本文件逐字段对比）。
- [x] 3.2 新建 `js/draft-store.js`：迁入 IndexedDB 打开/读写、`localStorage` envelope、损坏备份、`restoreDraft`、资产持久化与清理。`js/io.js` 保留薄封装或删除重复实现。验证：刷新恢复草稿、清除 `localStorage` 后降级、损坏草稿备份三条路径行为不变。
- [x] 3.3 新建 `js/project-io.js`：迁入结构序列化、`serializeProject`、`loadProjectFile`、`buildProject`、`downloadProject`。验证：项目 JSON 导出/导入往返深比较一致；含图项目导出后重新加载图片可用。
- [x] 3.4 校验约束去重：`validateProject` 的 fit/opacity/blur/margins 范围改由 `model` 的常量与规范化函数派生；错误消息保持中文原文。验证：`node --test scripts/checks/io.test.js` 全部通过；手工导入非法 JSON 的错误提示与拆分前一致。
- [x] 3.5 拆分完成后确认 `js/io.js` 只保留兼容导出（或删除），`index.html` 引用数量与 `build.sh` 产物校验一致。验证：`wc -l` 单文件不超过 900 行；`file://` 全流程回归。

## 4. 拆分 `js/model.js` 资产层

- [x] 4.1 新建 `js/assets.js`：迁入 `assets` 缓存（当前约 712-895 行）、`hashBytes`、`blobToBase64`、`base64ToBlob`、`downloadBlob`。`index.html` 在 `model.js` 前声明（或拆分为无依赖模块），末尾挂 `L.assets`。验证：上传图片、粘贴图片、预置物化、对象 URL 释放均正常。
- [x] 4.2 `js/model.js` 删除资产实现，仅保留数据模型、字体、样式、几何；更新所有 `L.assets` 引用点（`app.js`、`ui.js`、`io.js`、`export.js`）。验证：`grep` 无 `model.base64ToBlob` 等旧路径；导出/保存/恢复全流程通过。
- [x] 4.3 测试装载器在 Node 中直接加载 `model.js`（不注入 `document`），断言 `virtualWidth`、`createDefaultProject`、`computeImageResize` 可用。验证：`node --test scripts/checks/model.test.js` 通过，且无需浏览器桩。

## 5. 拆分 `js/ui.js`

- [x] 5.1 新建 `js/ui-modal.js`：迁入 `ui.modal` 全套（`open` / `alert` / `confirm` / 关闭、焦点陷阱、Esc、遮罩，约 150 行）。验证：导出弹窗、字体选择、背景库、歌单编辑器四处的打开/关闭/焦点返回不变。
- [x] 5.2 新建 `js/ui-fields.js`：迁入 `esc`、`field`、`fieldHelp`、`fieldPair`、`propGroup`、`helpTip`、`numberTier`、`numberInput`、`textInput`、`colorInput`、`selectInput`、`rangeInput`、`weightOptions`、`alignOptions`、`bind`、`valueOf`、`ctrlStepNumber` 等无状态工厂（约 215 行）。`ui.js` 改为引用。验证：属性面板所有字段外观与交互不变；`node --test` 中 HTML 转义用例通过。
- [x] 5.3 新建 `js/ui-pickers.js`：迁入 `openBackgroundLibrary`、`openPresetPicker`、预置索引加载、`renderPresetIndexError`、`renderPresetGrid`、`createLocalRow`、`createLinks`、`createHint`（约 326 行）。验证：背景库与「选择背景图」弹窗的三个入口、分类标签、懒加载、拖入本地图全部正常。
- [x] 5.4 新建 `js/ui-playlist-editor.js`：迁入 `ui.playlistEditor` 全套（约 590 行）。验证：编辑分类名、增删歌名、排序、重复校验、未应用修改确认全部正常。
- [x] 5.5 新建 `js/ui-property-panel.js`：迁入 `renderPropertyPanel`、`renderPageProperties`、`renderBackgroundSetProperties`、`renderBackgroundImageProperties`、`fontListField`/`bindFontList`、`shadowOutlineFields`/`bindShadowOutline`、`categoryStyleFields`/`bindCategoryStyle`、`tableCard`、`renderCategoryProperties`、`textStyleFields`、`renderTextProperties`、`renderImageProperties`（约 766 行，`capturePanelFocus`/`restorePanelFocus` 一并迁入）。这是 5.1-5.4 之后仍使 `ui.js` 超出 1200 行的主因，不可省略。
- [x] 5.6 拆分后 `ui.js` 保留侧栏（分类/图层/页面标签）、帮助提示、`ui.init`、`renderAll`、`toast` 与面板级事件委托，约 600 行。验证：`wc -l js/ui.js` ≤1200 且其余 ui 子模块 ≤900；`file://` 全流程回归；属性输入焦点与中文输入不中断。

## 6. 拆分 `js/app.js`

- [x] 6.1 新建 `js/app-presets.js`：迁入预置应用链路——`applyPreset`、`addPresetImage`、`applyPresetWhole`、`applyPresetAdd`、`applyPresetReplace`、`relativeLuminance`、`notifyDarkPreset`（约 136 行）。通过显式上下文接收 `state`、`assets` 与动作。验证：三个入口 × 背景图/透明图/本地组合全部通过；同一预置两次应用仍 hash 去重。
- [x] 6.2 新建 `js/app-backgrounds.js`：迁入背景库控制器——`addBackgroundSet`、`duplicateBackgroundSet`、`renameBackgroundSet`、`deleteBackgroundSet`、`setPageBackground`、`pickBackgroundImage`、`pickBackgroundImageWhole`、`handleBackgroundFile`、`handleDroppedBackgroundFile`、`deleteBackgroundImage`、`moveBackgroundImage`、`setBackgroundImageFit`、`restoreBackgroundImageFit`、`setBackgroundImageValue`、`toggleUnifiedBackground`、`setUnifiedBackground`、`bakeUnifiedBackground`、`copyUnifiedBackgroundToPage`（约 350 行）。这些函数在旧计划中没有任何任务归属，必须显式落位，否则 `app.js` 无法达标。验证：背景库增删改、单图 fit/透明度/模糊、统一背景开关与固化/独立副本全部正常。
- [x] 6.3 新建 `js/app-import-export.js`：迁入歌单导入/导出、项目 JSON 导入/导出、重导入确认——`escapeHtml`、`showImportErrors`、`openEncodingDialog`、`confirmReimport`、`handleImportFile`、`openImport`、`exportPlaylist`、`exportProject`、`openImportProject`、`discardBuiltAssets`、`handleImportProject`、`newProject`（约 240 行）。验证：UTF-8/GBK/BOM、重复导入确认、项目往返一致。
- [x] 6.4 新建 `js/app-draft.js`：迁入草稿开关、防抖保存、envelope 键、错误上报、启动恢复——`formatDraftTime`、`draftSnapshotKey`、`setDraftStatus`、`reportDraftError`、`scheduleDraftSave`、`saveDraftNow`、`flushDraftSync`、`persistDraftAssetQuietly`、`restoreDraftOnStartup`、`notifyDraftRecovery`（约 193 行）。验证：编辑后 300ms 写入、刷新恢复、配额错误提示、资产清理不变。
- [x] 6.5 新建 `js/app-interactions.js`：迁入指针与拖拽——`selectedElementAt`、`onPointerDown`、`beginPointer`、`onPointerMove`、`resizeDrag`、`dividerDrag`、`onPointerLeave`、`onPointerUp`、`onDoubleClick`、`startInlineEditor`、`closeInlineEditor`、`onDragOver`、`categoryDropPosition`、`onDrop`（约 480 行）。验证：元素/背景图拖动缩放、选中元素被覆盖时仍可抓取、方向键微调、列宽/边距/页尺寸拖拽、分类拖放、双击编辑全部正常；拖拽帧耗时与拆分前一致。
- [x] 6.6 新建 `js/app-viewport.js`：迁入画布表面与重绘调度——`surfaceRatio`、`syncSurface`、`setupSurface`、`toolbarChromeLeft`、`measureCanvas`、`effectiveScale`、`syncGeometry`、`scheduleRedraw`、`requestGeometry`、`requestRedrawFrame`、`flushRedraw`、`applyViewTransform`、`sizeViewportCanvas`、`pageScreenRect`、`toScreen`、`toPage`、`redraw`、`preparePageContext`、`drawBackgroundLayer`、`drawContentLayer`、`fit`、`updateZoomUI`、`centerAnchor`、`zoomAround`、`setZoomPercent`、`stepZoom`、`zoomIn`、`zoomOut`、`syncScrollOffsets`、`onCanvasScroll`、`onCanvasWheel`、`handleResize`（约 600 行）。验证：缩放 10%–400%、适应窗口、滚动同步、窗口 resize、分层重绘与 `drawStats` 计数不变。
- [x] 6.7 新建 `js/app-chrome.js`：迁入装饰层绘制、手柄几何与光标——`drawChrome`、`drawOverlayLayer`、`drawMarginGuides`、`marginHandlePoints`、`cachedOverflow`、`drawOverflow`、`drawRoundHandle`、`drawSquareHandle`、`screenFromPage`、`normalizeCursorAngle`、`resizeCursorKeyword`、`rotatedCursorSvg`、`handleCursor`、`imageHandlePoints`、`handlePoints`、`drawSelection`、`drawBackgroundSelection`、`drawTableDividers`、`drawPageSizeHandle`、`handleAt`、`dividerAt`、`pageSizeHandleAt`、`marginAt`、`updateCursor`、`refreshHoverCursor`、`overlayPoint`（约 450 行，含 `hoverPoint`/`lastAppliedCursor` 状态）。这些函数旧计划既不在 6.4 也不在 6.5 的语义范围内，却占了 `1-932` 的大半；`flushRedraw` 调 `refreshHoverCursor`，故本模块必须先于 `app-viewport.js` 加载。验证：选中框、手柄、页尺寸/边距参考线、旋转后光标方向（任意角 + 四角固定 +45°）、拖拽期间光标不抖动全部正常。
- [x] 6.8 `app.js` 只保留 `state`、`undo`/`pushUndo`、`clamp` 引用、选择模型（`currentPage`、`selectPage`、`selectBackground`、`selectElement`、`nudgeSelection`）、页面管理（`switchPage`、`addPageDialog`、`deleteCurrentPage`、`moveLayer`、`placeCategory`、`jumpToCategory`）、歌单编辑应用、属性写入动作（`setPageSize`、`setMargins`、`resizeElementWidth`、`setImageKeepRatio`、`changed`）、自由图片与粘贴、`init` 与公开 API（约 950 行）。验证：`wc -l js/app.js` ≤1200；`L.app` 公开方法签名不变；`index.html` 加载顺序为 `app-chrome.js` → `app-viewport.js` → `app-interactions.js` → 其余子域 → `app.js`；浏览器无 console 报错。

## 7. 状态写入收口（按引用式写入重写验收）

- [x] 7.1 说明现状：`js/ui.js` 已无 `L.app.state.project.<字段> =` 形式的直写（旧验收条件恒真，属假通过），真实写入是 23 处**引用式修改**——`element.x/y/width/height/rotation/opacity/blur/text/showTitle`、`element.style.fontSize/fontWeight/color/lineHeight/align`、`set.color`、`image.keepRatio/opacity/blur`，随后统一调 `L.app.changed`。把这份清单（当前 980、1044、1048、1054、1369、1373、1383、1470-1503、1540-1572 行，共 23 处）作为收口依据。验证：`grep -nE "^\s+(element|set|image)\.[A-Za-z.]+ = " js/ui.js` 的输出与清单一致。
- [x] 7.2 为上述类别补齐/复用意图方法（`setBackgroundColor`、`setBackgroundImageField`、`setElementField`、`setElementStyleField` 等；`setBackgroundImageValue`、`setPageSize`、`setMargins`、`resizeElementWidth`、`setImageKeepRatio`、`setBackgroundImageFit` 已存在，直接复用），逐处替换引用式写入，`changed({ property:false, layers })` 仍承担局部重绘。验证：`grep -nE "^\s+(element|set|image)\.([A-Za-z]+\.)?[A-Za-z]+ = " js/ui.js` 无命中（仅允许局部临时变量与输入回填）；属性输入焦点、滚动位置、撤销行为不变。
- [x] 7.3 把属性面板中重复的「取值 → 改模型 → 重绘」绑定抽成声明式辅助（可选，若 7.2 后可读性已足够则不做）。验证：字段数量不变，事件委托仍跨 `innerHTML` 重建存活。 实施记录：7.2 已消除 23 处引用式写入，绑定体已是「取值 → L.app 意图方法」两行，未再抽声明式辅助。
- [x] 7.4 事件委托评估：把 `js/ui.js` 中逐个 `bind` 的静态按钮改为面板级委托（可选）。验证：无重复监听、无焦点丢失；不做则不阻塞本变更归档。 实施记录：按可选条件评估后不做；点击绑定均为 `bind(id, event, fn)`，面板重建由事件委托到 document 承担，无重复监听。

## 8. 构建、文档与集成验证

- [x] 8.1 `build.sh` 的产物清洁检查覆盖 `js/dev-checks.js`（拷贝阶段排除 + 断言不存在）、`scripts/`、`presets/`；版本注入覆盖 `js/app.js` 的 `BUILD`。验证：`./build.sh` 成功，`dist` 中无开发期文件，`?v=` 与 `BUILD` 一致；源码存在 `js/dev-checks.js` 时构建仍成功。
- [x] 8.2 更新 `README.md` 的目录结构与开发约定：列出新增模块（含 `app-chrome.js`、`app-backgrounds.js`、`ui-property-panel.js`）、依赖方向、测试命令；更新 `AGENTS.md` 的「Working notes」。验证：文档中的文件清单与 `ls js/` 一致。
- [x] 8.3 集成回归矩阵（`file://`）：导入 UTF-8/GBK/BOM/重复项样本 → 拖分类 → 增删页 → 改页面/分类/文字/图片/背景属性 → 背景单独套用/加图/替换 → 导出 PNG（当前页/所有页/仅歌单层）→ 导出/导入项目 JSON → 刷新恢复草稿 → 撤销。验证：全流程无 console 报错，输出与拆分前一致。
- [x] 8.4 量化验收：`node --test scripts/checks/*.test.js` 全部通过；`./build.sh --zip` 成功且产物结构正确；`wc -l js/app.js js/ui.js` 均 ≤1200，其余运行时文件 ≤900（`js/presets-data/` 除外）。
- [x] 8.5 归档本 change（`/opsx-archive`）：确认 `openspec/specs/code-architecture/spec.md` 已合并、`release-build` delta 已应用（主规范中「20 个脚本 / 16 处引用」等硬编码数量随之被替换）、任务全部勾选。

## Workflow follow-up

- 先完成第 1 组并提交，后续每组单独提交；每组提交前运行第 1 组建立的测试与 `./build.sh`。
- 若中途发现行为差异，停止拆分，先补测试再修复，禁止在重构提交中顺带改行为。
- 模块边界以函数名维护，不再写死行号；若某次功能提交新增函数，先补归属再拆分。
