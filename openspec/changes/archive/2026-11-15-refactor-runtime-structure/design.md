# Design

## Context

当前运行时（不含 `js/presets-data/` 生成数据，含 `style.css` 与 `index.html`）约 12900 行、13 个脚本文件，基线如下：

| 文件 | 行数 | 主要职责 | 问题 |
|---|---|---|---|
| `js/app.js` | 3119 | 状态、视口、重绘、装饰层绘制、交互、背景库、内容创建、预置应用、导入、草稿、启动 | 编排与实现混杂，单文件承担 12 类职责 |
| `js/ui.js` | 2656 | 侧栏、属性面板、字段工厂、模态框、背景库、预置网格、歌单编辑器 | 视图层内部未分层，26 处 `innerHTML` 拼接 |
| `js/io.js` | 1185 | 校验 326 行、迁移、IndexedDB、草稿、序列化、下载 | 纯校验与浏览器存储耦合 |
| `js/model.js` | 959 | 数据模型、字体、样式、几何、资产缓存、下载 | 资产层依赖 `URL`/`Image`/`document`，不可在 Node 加载 |
| `js/layout.js` | 903 | 测量、换行、列宽、填充、续表、`devChecks()` 353 行（520-872） | 39% 为开发期自检 |
| 其余 8 个文件 | 62–593 | 导入、导出、ZIP、字体、预置、剪贴板 | 拆分合理，保持 |

依赖现状是隐式的：`index.html` 的 `<script>` 顺序是唯一依赖声明；模块间通过 `window.Listify` 命名空间相互引用，`ui` 大量读取 `L.app.state` 并直接改写其中对象的字段，`app` 又回调 `ui.renderAll()`，形成双向耦合。

已确认的重复/不一致：

- `clamp`：`js/app.js:133` 与 `js/model.js:59` 各一份；
- 深拷贝：`js/app.js:76/78` 与 `js/io.js:490` 各写一次 `JSON.parse(JSON.stringify())`，而 `model.clone` 已存在；
- 下载：`model.downloadBlob` 已是唯一触发实现（`io.js:190`、`playlist-export.js:40` 均委托它），只需保持；
- HTML 转义：`js/app.js:2510 escapeHtml` 与 `js/ui.js:16 esc` 是同一正则的两份实现；
- 版本：`js/app.js:10` 的 `BUILD = '20261110b'` 与 `index.html:119` 的 `?v=20261110c` 不一致；
- 约束：`validateProject` 与 `model` 的默认值/范围各自维护。

## Goals / Non-Goals

**Goals:**

- 在不改变行为、数据格式和零构建约束的前提下，把运行时拆成职责单一、依赖方向明确的模块。
- 建立可在本机零安装运行的回归安全网，让后续拆分有可验证的基线。
- 让纯逻辑（模型、布局、校验、序列化）脱离浏览器 API，可在 Node 中直接测试。
- 发布产物只含运行时文件，构建标识与 `VERSION` 一致。
- 每步拆分可独立提交、独立回滚，避免一次性大爆炸式重构。

**Non-Goals:**

- 不引入 npm、`package.json`、打包器、转译、ES module、CDN 或任何运行时网络请求。
- 不改项目 JSON 结构、草稿 schema、导出输出、UI 文案与交互行为。
- 不拆 `style.css`（已有清晰分区与设计令牌），不做脏矩形、增量撤销等与结构无关的性能优化。
- 不追求 canvas / DOM 的高覆盖率单测；UI 仍以浏览器流程验证为主。
- 不把 `L.app.state` 改成响应式状态库，也不追求一次性完成全部状态收口。

## Decisions

### D1. 零依赖测试：`node:test` + `vm` 装载器

现有模块是 IIFE + `window.Listify`，不能直接 `require`。测试用 Node 内置 `vm` 创建沙箱，注入最小 `window`（`Listify` 命名空间、`devicePixelRatio`、`crypto`）与 `document` 桩，按依赖顺序执行源文件，再从沙箱取 `window.Listify`。

`document` 桩不能只满足颜色探测：`js/layout.js:15` 在脚本加载时就 `document.createElement('canvas')` 并缓存 `measureCtx`，`layout` 的 `measureText` 又是闭包内部调用（覆盖导出的 `L.layout.measureText` 无效）。因此桩里的假 canvas 必须提供确定性的 `getContext('2d').measureText`（例如 `width = virtualWidth(text) * fontSize * 0.6`），颜色探测与文本度量共用，测试基线才可复现。

- 测试范围优先纯逻辑：`model.virtualWidth`、`sortSongs`、`assignTableSongs`、`layoutCategory`（用固定 `measureText` 桩）、`createDraftEnvelope`、`validateProject`、ZIP 目录结构、字体栈归一化。
- 不为 canvas 绘制、指针交互、IndexedDB 写用例；这些继续用浏览器手工/自动化流程验证。
- 运行方式：`node --test scripts/checks/*.test.js`，不写 `package.json`，不要求 `npm install`。

**备选**：引入 Vitest/Jest——需要 npm，违背零构建与无依赖约束，排除。

### D2. 开发期自检与生产产物隔离

`devChecks()` 迁到 `js/dev-checks.js`，暴露 `L.devChecks()`；同时删除 `js/app.js` 末尾的 `L.devChecks` 转发包装（`app.js` 后加载，否则会覆盖新文件导出并调用已删除的 `layout.devChecks`）。`index.html` 不引用该文件；需要时在浏览器控制台手动注入 `<script>` 或由测试装载器执行。

`build.sh` 的 `copy_tree js` 是全量递归拷贝：若只加黑名单断言，源码里存在该文件时每次构建都会失败。正确顺序是拷贝阶段排除 `js/dev-checks.js`，随后在 `assert_dist_clean()` 中断言产物不含该文件（防止将来拷贝逻辑回退）。

保留 `L.devChecks` 的浏览器调试入口，但不再默认执行，也不再进入 `dist/`。

### D3. 目标分层与依赖方向

```
util
  ├─ model ── assets
  ├─ layout ── model
  ├─ render ── model, layout
  ├─ project-schema ── model
  ├─ draft-store ── project-schema
  ├─ project-io ── model, assets, project-schema
  ├─ ui-fields / ui-modal / ui-pickers / ui-playlist-editor / ui-property-panel
  └─ ui ── model, layout, 上述 ui 子模块
        └─ app ── model, layout, render, ui, assets, project-io, draft-store
             ├─ app-chrome
             ├─ app-viewport ── app-chrome（重绘结束刷新光标）
             ├─ app-interactions ── app-chrome（命中测试与光标）
             ├─ app-presets
             ├─ app-backgrounds
             ├─ app-draft
             └─ app-import-export
```

规则：

- 依赖 MUST 单向，禁止底层模块反向引用 `L.app`（唯一例外是 UI 通过显式注入的动作回调）。
- `app` 是编排层，允许依赖 UI；`ui` 只通过 `L.app` 的公开意图方法访问状态，不直接改 `state.project`。
- 新增运行时文件 MUST 在 `index.html` 按依赖顺序声明，并由 `build.sh` 的拷贝清单自动覆盖。

### D4. `io.js` 拆三层

| 新模块 | 内容 | 依赖 |
|---|---|---|
| `js/project-schema.js` | `validateProject`、`isFiniteNumber`、旧版 `migrateLegacyBackgrounds` / `buildBackgroundSet`、错误结构 | `model` |
| `js/draft-store.js` | IndexedDB 打开/读写/清理、`localStorage` envelope、损坏备份、`restoreDraft` | `project-schema` |
| `js/project-io.js` | `serializeProjectStructure` / `serializeProject`、`loadProjectFile`、`buildProject`、`downloadProject` | `model`、`assets`、`project-schema` |

校验与模型的约束统一：由 `model` 暴露 `BACKGROUND_FITS`、`normalizeStyle`、`normalizeMargins` 等，`validateProject` 只负责引用完整性与错误消息，不再重复定义取值范围。

### D5. `model.js` 拆出 `assets.js`

把 `js/model.js:712-895` 的 `assets` 缓存、`hashBytes`、`blobToBase64` / `base64ToBlob`、`downloadBlob` 迁到 `js/assets.js`，末尾挂 `L.assets`。`model.js` 保留：

- `uid` / `clamp` / `clone` / `utils`；
- 字体栈解析与样式归一化；
- 背景集/页面/元素工厂与查询；
- 几何（`rotateVector`、`computeImageResize`、`migrateImageRect`）；
- 纯数据辅助（`virtualWidth`、`fontString`）。

迁移后 `model.js` 在 Node 中可直接加载（`document` 颜色探测已有 `typeof document === 'undefined'` 守卫）。

### D6. `ui.js` 拆五块

| 新模块 | 内容 | 说明 |
|---|---|---|
| `js/ui-modal.js` | `ui.modal.open / alert / confirm / close`、焦点陷阱、Esc、遮罩 | 已是独立对象，几乎原样搬迁（约 150 行） |
| `js/ui-fields.js` | `esc`、`field`、`fieldPair`、`numberInput`、`textInput`、`colorInput`、`selectInput`、`rangeInput`、`propGroup` 等 | 无状态工厂（约 215 行） |
| `js/ui-pickers.js` | `openBackgroundLibrary`、`openPresetPicker`、预设索引加载、`renderPresetGrid`、素材指引链接 | 依赖 `ui.modal`、`L.presets`、`L.app` 动作（约 326 行） |
| `js/ui-playlist-editor.js` | 歌单编辑器弹窗（分类/歌名网格/校验/应用） | 依赖 `ui.modal`、`model`（约 590 行） |
| `js/ui-property-panel.js` | `renderPropertyPanel` 与页面/背景集/背景图/分类/文字/图片属性渲染、字体列表、阴影描边、表格卡片、焦点保持 | 旧计划「属性面板暂留」会使 `ui.js` 仍有约 1375 行，超出 1200 行硬指标；必须一并拆出（约 766 行） |

`ui.js` 保留侧栏渲染（分类/图层/页面标签）、帮助提示、`ui.init`、`renderAll`、`toast` 与事件委托（约 600 行）。

### D7. `app.js` 拆七个子域，保留核心编排

按耦合度从低到高拆，括号内为迁移后预估行数：

1. `js/app-presets.js`：预置物化、整套/加图/替换、去重命名、深色提示（约 136 行）；
2. `js/app-backgrounds.js`：背景库控制器——背景集/背景图增删改排序、`fit`/`opacity`/`blur` 写入、统一背景开关与固化/独立副本（约 350 行）；
3. `js/app-draft.js`：草稿开关、防抖保存、envelope 键、错误上报、启动恢复（约 193 行）；
4. `js/app-import-export.js`：歌单导入/导出、项目 JSON 导入/导出、重导入确认（约 240 行）；
5. `js/app-interactions.js`：`selectedElementAt`、`onPointerDown/Move/Up`、`drag`、`resizeDrag`、`dividerDrag`、`startInlineEditor`、`onDrop`（约 480 行）；
6. `js/app-chrome.js`：装饰层绘制（`drawChrome`、`drawOverlayLayer`、选择框、参考线、手柄）、手柄几何与命中（`handleAt`、`dividerAt`、`marginAt`、`pageSizeHandleAt`）、光标（`updateCursor`、`refreshHoverCursor`、`handleCursor`、`rotatedCursorSvg`）（约 450 行）；
7. `js/app-viewport.js`：`setupSurface`、`syncSurface`、`scheduleRedraw`、`flushRedraw`、`applyViewTransform`、`fit`、缩放与滚动同步（约 600 行）。

拆分前 `app.js` 的 `1-932` 行里，装饰层/手柄/光标既不在旧 6.4（指针交互）也不在旧 6.5（画布表面与缩放）的语义范围内，却占了近一半；不单独落位会导致 `app-viewport.js` 逼近 900 行上限、`app.js` 仍超 1200 行。`flushRedraw` 调用 `refreshHoverCursor`，因此 `app-chrome.js` 必须先于 `app-viewport.js` 加载。

迁移方式：每个子域接收一个显式上下文 `{ state, viewport, actions }`，由 `app.js` 在启动时构造并传入；子域不直接引用另一个子域的内部变量。`app.js` 保留 `state`、选择模型、页面管理、属性写入动作、`changed`、自由图片与粘贴、公开动作与 `init`（约 950 行）。

**备选**：把 `state` 挂到 `L.app.state` 上供所有子域读写——会扩大可写全局面，违背 D3，排除。

### D8. 状态写入收口（分阶段）

现状修正：`ui.js` 已无 `L.app.state.project.<字段> =` 直写（旧验收条件恒真，会假通过），真实写入是 23 处通过引用取得的模型对象赋值——`element.x/y/width/height/rotation/opacity/blur/text/showTitle`、`element.style.fontSize/fontWeight/color/lineHeight/align`、`set.color`、`image.keepRatio/opacity/blur`，随后统一调用 `L.app.changed`。

第一阶段：

- 为这些类别补齐意图方法（`setBackgroundColor`、`setBackgroundImageField`、`setElementField`、`setElementStyleField` 等；`setBackgroundImageValue`、`setPageSize`、`setMargins`、`resizeElementWidth`、`setImageKeepRatio`、`setBackgroundImageFit` 已存在，直接复用）；
- `ui.js` 中的引用式写入逐处替换为动作；
- `changed({ property:false, layers })` 保留为局部重绘入口。

验收：`grep -nE "^\s+(element|set|image)\.([A-Za-z]+\.)?[A-Za-z]+ = " js/ui.js` 无命中（局部临时变量与输入回填除外）；行为与焦点/滚动表现不变。

### D9. 工具函数唯一实现

新增 `js/util.js`（或复用 `model` 的既有导出）：

- `clamp`、`clone` 从 `model` 导出，`app.js` 删除本地副本；
- 下载统一走 `model.downloadBlob` / `assets.downloadBlob`（现状已满足）；
- HTML 转义统一为单一实现（`app.js:2510 escapeHtml` 与 `ui.js:16 esc` 二者只留一份，另一侧复用）；
- 字体族引用统一走 `model.quoteFamily`（`fontpicker` 已是此模式，保持）。

### D10. 版本标识单一来源

`build.sh` 在 `inject_version` 后追加：

- 将 `js/app.js` 的 `const BUILD = '...'` 改写为 `VERSION` 值（保留 `L.BUILD` 导出）；
- 或在源码删除手工常量，由构建注入 `window.LISTIFY_BUILD`。

验收：`dist/index.html` 的 `?v=<VERSION>` 与 `dist/js/app.js` 的 `BUILD` 一致；`grep` 不再出现与 `VERSION` 冲突的字面量。

### D11. 执行约束

- 开工前先做一次基线校准：模块边界以函数名维护，行号只作参考（自 `0ffccf6` 以来 `app.js` 已增加约 175 行，旧行号区间已失效两次）。
- 每个拆分步骤独立提交，提交前运行：`node --test scripts/checks/*.test.js`、`./build.sh`、浏览器 `file://` 手工流程（导入、增删页、拖分类、改属性、导出 PNG、刷新恢复草稿）。
- 每步只搬代码与改引用，不顺带改行为、样式、文案。
- 新增文件必须在 `index.html` 中按依赖顺序声明，`build.sh` 自动递归拷贝 `js/`，无需改拷贝逻辑；但拷贝阶段要排除 `js/dev-checks.js`，产物清洁检查要能发现误入则失败。
- 拆分完成后 `app.js` / `ui.js` 各不超过 1200 行，其余运行时文件不超过 900 行（`js/presets-data/` 生成数据不计入）。按模块归属预估：`app.js`≈950、`app-chrome`≈450、`app-viewport`≈600、`app-interactions`≈480、`app-backgrounds`≈350，`ui.js`≈600、`ui-property-panel`≈766。

## Risks / Trade-offs

- [拆分导致回归] → 先建立 `node:test` 安全网；每步只做代码搬迁；每步跑构建与手工流程；保留原文件到该步验证通过后再删除。
- [全局 API 表面扩大] → 子域通过显式上下文对象接收依赖，不把 `state`/`viewport` 挂成新的可写全局；`L.app` 只增加意图方法。
- [加载顺序出错] → `index.html` 显式声明顺序；构建产物做引用存在性校验；新增文件在 `AGENTS.md` 记录依赖。
- [构建漏拷新文件] → `build.sh` 现有 `copy_tree js` 自动覆盖；新增产物黑名单校验；`dist` 构建后检查关键文件。
- [测试桩与真实浏览器行为漂移] → 测试只覆盖纯函数与数据逻辑；canvas/交互/存储仍以浏览器验证为准，测试不替代手工回归。
- [重构期间功能开发冲突] → 建议在功能冻结窗口内执行；若无法冻结，按文件划分，避免同一提交同时重构与改行为。

## Migration Plan

- 纯内部重构，无项目数据迁移；项目 JSON 保持版本 3，草稿 schema 保持 1。
- 回滚：每步独立提交，回滚该步即可；不涉及用户数据。
- 发布：按 minor 版本升 `VERSION`；`?v=` 与 `BUILD` 注入保证缓存更新。

## Open Questions

- `app-chrome` 是否应该再拆出 `app-handles.js`（手柄几何被装饰层绘制与命中测试共用），还是按当前设计整体保留在 450 行左右。
- 状态收口第二阶段是否值得把 `selection` 也改为动作访问，还是保留为只读快照。

已定：`L.devChecks` 保留为浏览器公开入口，但只存在于 `js/dev-checks.js`，不随产物分发。