# Tasks

## 1. 平台语义基座（第 1 批，可独立发布）

- [x] 1.1 在 `js/ui.js` 增加唯一的组合输入判定 `ui.isComposingEvent(event)`（`event.isComposing || event.keyCode === 229` + `compositionstart/end` 标志，`compositionend` 后置零延迟到微任务），并在 `js/ui-playlist-editor.js` 改为调用它；验证：`grep -rn "keyCode === 229\|isComposing" js/` 只有该函数内部的定义与各调用点，无第三份判定逻辑，且 `node --test scripts/checks/*.test.js` 通过
- [x] 1.2 `js/app-interactions.js:424-432` 的行内编辑 Enter/Escape 改用 `ui.isComposingEvent`；验证：双击自由文字，用拼音输入「歌单」，候选未上屏时按 Enter 只上屏不结束编辑，按 Escape 只取消候选不关闭编辑框
- [x] 1.3 `js/ui.js:257-268` 的缩放百分比 Enter 提交改用 `ui.isComposingEvent`；验证：在缩放输入框用输入法组合 `150` 后按 Enter 选择候选，输入框保持焦点且比例不提交，再次按 Enter 才提交并显示 150%
- [x] 1.4 `#toast-root` 增加 `role="status"` `aria-live="polite"` `aria-atomic="false"`，`ui.toast` 只追加子节点；MUST NOT 改可见时长、位置、并发数量或退场方式；验证：`ui.toast('测试')` 后读屏（或 Accessibility 面板）能播报文本且焦点未移动，出现位置与消失时机与改动前逐帧一致
- [x] 1.5 `style.css` 增加 `@media (prefers-reduced-motion: reduce)` 块，覆盖模态进入、toast、箭头旋转与 hover 过渡（默认模式不动）；把 `:1509-1512` 的 `clip: rect(0 0 0 0)` 改为 `clip-path: inset(50%)`；验证：DevTools Rendering 面板开启「Emulate CSS prefers-reduced-motion」后打开对话框与 toast 无动画，关闭模拟后动画时长与改动前一致，`.visually-hidden` 元素仍不可见但可被读屏访问
- [x] 1.6 为所有提示触发控件补充 `aria-describedby` 指向唯一提示元素 id，`js/ui.js` 的 `initToolbarTips` / `initPropTips` 只在显示时写入文案；MUST NOT 改动 `place()`、`--arrow-x`、150ms 延迟与 Escape 捕获；验证：Accessibility 面板中工具条图标与 `?` 图标的描述即为提示文字，提示位置与改动前一致
- [x] 1.7 确认未引入 Baseline 之外的能力：`grep -rn "popover\|anchor-name\|position-area\|closedby\|scrollbar-gutter\|requestIdleCallback\|until-found" index.html js/ style.css` 无新增命中；验证：命令输出为空

## 2. 结构替换（第 2 批）

- [x] 2.1 重写 `js/ui-modal.js` 内部为 `<dialog>` + `showModal()`，保留 `ui.modal.open/alert/confirm` 签名；删除 `focusableList` 与 Tab 包裹、删除「`event.target === root`」的遮罩判定；焦点返回加幂等守卫；`alert` 使用 `alertdialog`；对 `dialog` 做 UA 重置并沿用 `.modal` 的宽度/圆角/`max-height:86vh`/进入动效，`::backdrop` 用 `rgba(15, 23, 42, .38)`；验证：五个模态入口（背景库、导出、字体、歌单编辑器、新建确认）外观截图与改动前一致，Escape 与遮罩行为符合 `specs/modal-dialog/spec.md`，关闭后焦点回到触发按钮且不跳位
- [x] 2.2 实现遮罩关闭的坐标判定：记录 `pointerdown` 目标与坐标、`pointerup` 时两者都在 `dialog` 矩形外才关闭；验证：Chromium/Firefox/Safari 中「点击遮罩关闭」「在对话框内按下拖到遮罩抬起不关闭」「点击对话框内边距不关闭」三项均通过
- [x] 2.3 删除 `js/ui.js:167-173` 与 `js/fontpicker.js:282-286` 的 Escape capture 拦截，改由 `cancel` 事件处理；歌单编辑器在 `cancel` 中按既有取消规则确认；验证：按一次 Escape 只关闭最上层对话框，歌单编辑器有未应用改名时先弹确认而非直接关闭
- [x] 2.4 `index.html:30-35`/`:44-45` 与 `js/ui.js:360-370` 把左侧切换改为 `aria-pressed` + `aria-controls`，面板补 `aria-labelledby`，删除 `role="tab"/"tablist"/"aria-selected"`；MUST NOT 引入 roving tabindex 或方向键；验证：读屏读出「已按下/未按下」，Tab 顺序与改动前完全一致（两个按钮仍依次可聚焦），点击与视觉状态不变
- [x] 2.5 `js/ui.js:384-398` 的页面页签去掉 `role="tablist"/"tab"`，改为普通按钮 + `aria-current="page"`；验证：页签可逐个 Tab 聚焦，Enter/点击切换，读屏朗读「当前页」，尺寸与选中样式与改动前一致
- [x] 2.6 `js/ui.js:407-421` 分类行改为 `<button draggable="true">`，删除 `:434-439` 手写 Enter/Space；`renderLayerPanel` 的图标按钮补 `aria-label`、装饰 SVG 补 `aria-hidden`；CSS 补齐按钮默认样式重置以保持行高/内边距/字号不变；验证：Tab 到分类行按 Enter 可放置分类，行外观截图与改动前一致，拖拽仍可用，读屏朗读行名与动作名
- [x] 2.7 `js/ui-property-panel.js` 的分区卡片改为 `<details open>` + `<summary>`，`toggle` 事件写回既有折叠记忆，`style.css:443-503` 改为 `details`/`summary` 样式并隐藏原生 marker；验证：点击、Enter、Space 均可折叠，重渲染后折叠状态保持且按对象记忆，标题行高/箭头形状/边框内边距与改动前截图一致
- [x] 2.8 更新 `AGENTS.md` 与 `README.md` 中关于模态、视图切换、分组折叠的实现描述；验证：文档中的文件/行为描述与代码一致，`grep -n "modal-root\|role=\"dialog\"\|role=\"tab\"" AGENTS.md README.md` 不再指向已删除或已变更的实现

## 3. 性能（第 3 批）

- [x] 3.1 `index.html:117-147` 全部脚本加 `defer`，`js/app.js` 启动改为文档就绪后执行（`readyState` 检查 + `DOMContentLoaded`）；验证：`file://` 直接打开与 `dist/index.html` 均正常启动，DevTools 网络中脚本并行下载、解析阶段无长任务，`node --test` 不受影响
- [x] 3.2 `js/app-chrome.js` 的光标更新移到 rAF 队列（每帧取最后一次指针位置），`overlayPoint` 的 `getBoundingClientRect` 按几何版本缓存；`js/app-viewport.js` 的 resize 改为 `requestGeometry()` 合帧；保留现有两次测量路径，MUST NOT 引入 `scrollbar-gutter`；验证：快速划过页面时每帧至多一次布局读取，拖动窗口边缘时每帧至多一次几何测量，拖拽手感与改动前一致
- [x] 3.3 `js/ui-pickers.js:235,318` 的预取改为「停留 300ms 或 `pointerdown`」，`js/presets.js` 的 `loadScript` 在 `setTimeout(0)` 中注入并返回去重 Promise；MUST NOT 使用 `requestIdleCallback`；验证：快速划过一排分类标签时 Network 面板不产生分类块请求，停留 300ms 后才加载，点击时立即加载
- [x] 3.4 `scripts/build-presets.sh` 按体积拆分超大分类块（overlay、pattern），`js/presets-data/index.js` 记录分块，运行时按预置 id 定位块；重生成 `js/presets-data/` 后 `./build.sh` 通过其既有的「索引块存在性」校验；验证：`./build.sh` 成功，任一单块加载在 Performance 面板中不产生超过 50ms 的连续任务，已应用旧预置的项目导出再导入后图片一致
- [x] 3.5 草稿库升级到 v2：新增 `assetBlobs` store 存 `Blob`，读取时把旧 base64 记录转换并回写，旧 store 保留；验证：打开旧草稿后图片完整显示，Application → IndexedDB 中资产值为 Blob，刷新后草稿正常恢复，`js/export.js` 产出的项目 JSON 仍为 base64
- [x] 3.6 草稿信封构建退出交互路径：`js/app-draft.js` 的序列化移到 `setTimeout(0)`（或下一帧之后），`saveDraftNow` 只做快照判重与入队，`pagehide` 保留一次同步兜底；验证：在含多页与多图的项目中连续输入/拖拽，Performance 面板无保存引起的长任务，立即关闭页面后重开仍是最后一次编辑
- [x] 3.7 `js/ui-property-panel.js` 改为按 `data-field` 就地更新，结构性改值只重建对应卡片并在重建前记录/恢复焦点与选区；验证：表格列数从 3 改 4 后焦点仍在表格卡片，面板滚动位置不变；连续点击数值框原生箭头与 Ctrl+方向键步进不中断
- [x] 3.8 更新 `AGENTS.md` 与 `README.md` 中关于脚本加载顺序、预置预取/分块、草稿存储格式的说明；验证：文档描述的 `index.html` 加载方式、`build-presets.sh` 产物与 `draft-store` 行为与代码一致

## 4. 集成验证

- [x] 4.1 运行 `node --test scripts/checks/*.test.js`，确认纯逻辑（字宽、排序、动态行、序列化往返、ZIP）全部通过且无新增依赖
- [x] 4.2 运行 `./build.sh` 与 `./build.sh --zip`，确认 `dist/` 不含 `js/dev-checks.js`、`scripts/`、`presets/`，`?v=` 注入数量与本地引用一致，`dist/index.html` 以 `file://` 打开可完成导入→编辑→导出全流程
- [x] 4.3 用 `agent-browser` 跑一遍关键路径：打开背景库→Escape 返回焦点、导出对话框→遮罩关闭、左侧视图切换（点击与 Tab）、页面页签切换、属性分组折叠、toast 出现与消失；记录每步的实际结果
- [x] 4.4 手动 IME 回归：在行内文字编辑、缩放输入、歌单编辑器歌名格、导出尺寸输入四处，用拼音组合后分别按 Enter 与 Escape，确认无提交、无关闭、无导航副作用
- [x] 4.5 视觉与交互回归：对顶栏、左侧素材栏、属性面板（展开/收起）、四个模态、页面页签在改动前后各截一张同尺寸图，逐像素比对只允许抗锯齿差异；确认 Tab 顺序、拖拽手感、滚动位置与动效时长未变
- [x] 4.6 性能回归：按 `design.md` D14 的阈值录制改动前后各 3 次 5 秒连续拖拽，帧时间中位数上升不超过 1ms 且无新增 >50ms 长任务；超阈值则按 D14 的回退顺序放弃对应子项
- [x] 4.7 对比审计报告 `docs/modern-web-audit-2026-11.md` 的高/中优先级清单，逐项确认已实现或已记录未做的理由；确认低优先级 12 项与本轮明确排除项（popover、锚点定位、`closedby`、`scrollbar-gutter`、`requestIdleCallback`、`dvh`、命中区、焦点环）未被顺手改动（`git diff --stat` 只包含本变更涉及的文件）

## Workflow follow-up

- 全部批次验证通过并归档后，按 `openspec archive` 把增量规格合并进 `openspec/specs/`。
