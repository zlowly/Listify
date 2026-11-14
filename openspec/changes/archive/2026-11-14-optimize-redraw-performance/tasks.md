# Tasks

## 1. 双画布分层（design D1）

- [x] 1.1 在 `#leafer-view` 内建双层画布：index.html 增加 `#bg-canvas`（下层）与 `#content-canvas`（上层，透明）+ style.css 绝对定位叠加样式；`setupSurface` 移除 Leafer 初始化分支，统一创建两个 plain canvas（位图 `pageW×pageH×ratio`，CSS 尺寸 `pageW×pageH`，沿用 `#leafer-view` 的 CSS transform）；`syncSurface` 同步两个画布的位图尺寸。验证：file:// 打开页面，背景填充色/图片、歌名文字、选择框与 overlay 均正常显示；控制台无异常。
- [x] 1.2 屏幕绘制拆分两遍：背景层直接用现 `drawBackground` 路径，内容层用 `drawPage({includeBackground:false})`（保留 `drawPage` 现有签名与行为供 export.js 使用，导出路径不改）；屏幕重绘分别写入两个画布。验证：整页与仅歌单两种 PNG 导出与改动前输出一致（同参数逐帧对比）；屏幕视觉与改动前一致。
- [x] 1.3 位图像素预算：`setupSurface`/`syncSurface` 按 `MAX_CANVAS_PIXELS`（16M）计算有效比例 `min(2, devicePixelRatio, sqrt(MAX_CANVAS_PIXELS/(pageW*pageH)))`，两层画布共用；5000×5000 页不崩溃。验证：默认页仍为 2×；把页尺寸改到 5000×5000 后控制台无异常、内存不失控、画面可用。

## 2. 重绘合帧调度（design D2）

- [x] 2.1 `redraw()` 改脏标记 + rAF 合帧（`scheduleRedraw`）：`bgDirty/contentDirty/overlayDirty` 标志，rAF 回调按脏标志只重绘对应画布，每帧至多一次；全部交互入口（`onPointerMove` 各分支、边距/页尺寸拖拽、滑条 input、数值 input/change、属性提交、选择变化）改为置脏标志，不再同步重绘；背景类操作只置 `bgDirty/overlayDirty`（`changed({property:false, layers:[...]})` 传入图层）。验证：DevTools Performance 下拖动元素/背景图，单帧内每层画布绘制操作 ≤ 1 次；事件停止后画布状态与最后一次事件的最终值一致（spec「重绘合帧」两个场景）。
- [x] 2.2 `syncGeometry` 移出每帧热路径：仅在页尺寸变化、窗口 resize、缩放模式/百分比变化、滚动同步、初始化时调用；`redraw()` 内移除 `applyViewTransform`、`updateZoomUI`、`scheduleGeometryReflow`，连续交互期间不重测几何。验证：Performance 面板中拖拽帧内无强制 reflow（Layout）事件；拖拽结束后缩放/滚动坐标一致（手工过 canvas-view「缩放与滚动后的坐标一致」全部既有场景：滚动后点选、放大拖边距、滚动后拖动背景图、旋转背景图）。
- [x] 2.3 overlay 装饰层拆分（design D6）：index.html/style.css 增加 `#overlay-chrome`（`#overlay` 下层、同尺寸）；`drawOverlay` 拆为静态装饰（页面阴影/边框/边距参考线/溢出徽标/页尺寸手柄）与交互层（选中框/手柄/表格分隔线）；装饰层仅在 `geometryDirty || contentDirty` 时重绘，`pageOverflow` 结果按 `overflowDirty` 缓存。验证：拖动背景图/拖透明度与模糊滑条时装饰层绘制 0 次、`pageOverflow` 调用 0 次，选择框仍跟随；改内容/页尺寸后装饰层与溢出徽标正常更新。
- [x] 2.4 `redraw()` 收尾清理：草稿保存 `scheduleDraftSave` 从事件路径移到合帧回调统一调度（每帧至多一次）；确认无遗留的同步 `redraw()` 调用导致重复绘制。验证：编辑后 300ms 内草稿仍写入；拖拽期间不产生每事件一次的重复 `setTimeout` 链。

## 3. 布局缓存生效（design D3）

- [x] 3.1 `layoutCategory` 增加布局签名缓存：签名 = 歌曲列表 + `element.width` + `showTitle` + 字体测量字段（fontFamilies/fontFamily/fontSize/fontWeight/fontStyle）+ `lineHeight` + tables 配置（columns/rows/fill/align/widthMode/widths/margins）+ editMode；**不含**颜色/阴影/描边；在 `normalizeTables()` 之后计算；命中则返回 `_layoutByMode` 缓存；`layoutText` 同理（text + width + 字体测量字段 + lineHeight）。验证：连续步进分类/自由文字的 X 值，Performance 中该元素无新增文本测量调用；改颜色/描边/阴影不触发重算；改字体/宽度/歌曲/表格配置触发重算；布局结果视觉与改动前一致（列宽、换行、溢出红块、空占位）。
- [x] 3.2 在 layout.js 的 devChecks 中补「缓存命中结果与全量重算结果一致」断言。验证：开发构建下正常编辑（改歌名、改宽度、改样式、改表格配置）断言不触发；签名输入变化后确认发生重算。
- [x] 3.3 帧令牌：每次 rAF 帧开始递增 `frameToken`，元素缓存记录 token，同帧内 `drawPage`/`pageOverflow`/`elementBounds`/`tableDividers` 重复请求直接返回缓存，不再重复计算签名。验证：单帧内同一分类的 `layoutCategory` 实际执行 0 次（缓存命中），签名计算次数 ≤ 1。

## 4. 背景图数值输入就地提交（design D4）

- [x] 4.1 `setBackgroundImageValue` 去掉 `ui.renderAll()`，改 `changed({property:false, layers:['bg','overlay']})` 并把输入框 `value` 回写为模型值；`setBackgroundImageFit` 保留 `renderAll()`（fit 模式切换改变字段结构）。验证：连续按背景图 X/Y/宽/高/旋转箭头（含 Ctrl+方向键大步进）输入框保持焦点、持续步进不中断；输入越界值后显示校正为模型值；面板滚动位置与分组卡片折叠状态不变（spec「面板输入就地提交」三个场景）。

## 5. 集成验证

- [x] 5.1 性能验收：准备 ≥200 首歌的歌单（samples/ 现有列表或生成临时列表），DevTools Performance 对比空页与多歌页下背景图拖动/缩放/旋转、透明度/模糊滑条的帧耗时，记录实测基线，确认帧耗时不随歌曲数明显增长。
- [x] 5.2 规格场景逐项核对：canvas-view 新增场景（高频滑条拖动、拖拽合帧、多歌页面调整背景图、内容层视觉不变、导出一致、背景拖拽不重算装饰、几何测量仅变化时执行）与 editor-shell 新增 3 个场景（连续步进背景图坐标、滑条调整后焦点与滚动保留、连续步进宽高）全部通过。
- [x] 5.3 回归矩阵：空页/多歌页背景图全操作；元素拖动与双击行内编辑；缩放/滚动/页签切换；页尺寸与边距拖拽；项目 JSON 保存与加载（草稿兼容）；PNG 导出；Leafer script 加载失败场景（新双 plain canvas 逻辑直接接管，无异常）。全部通过。
- [x] 5.4 量化计数器与验收：注入调试计数器（`layoutCategory` 重算次数、`measureText` 次数、`pageOverflow` 次数、各 canvas 绘制次数、`Layout` 事件），用 agent-browser 跑 0/50/200/500 首歌的固定操作序列，记录 p95 帧耗时；验收线：背景操作帧耗时与歌曲数无关且 < 8ms（实测后可调），导出 PNG 与改动前逐像素一致。

可选项（未排入本次跟踪任务）：design D5 两端对齐逐字 metrics 预计算，仅在 5.1 实测帧预算超支时另行立项。

## Workflow follow-up

- 全部任务完成且回归通过后，归档本 change（`/opsx-archive`）。
