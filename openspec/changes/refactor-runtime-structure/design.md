# Design

## Context

当前运行时（不含 `js/presets-data/` 生成数据）约 12700 行、13 个文件，基线如下：

| 文件 | 行数 | 主要职责 | 问题 |
|---|---|---|---|
| `js/app.js` | 2944 | 状态、视口、重绘、交互、内容创建、预置应用、导入、草稿、启动 | 编排与实现混杂，单文件承担 12 类职责 |
| `js/ui.js` | 2650 | 侧栏、属性面板、字段工厂、模态框、背景库、预置网格、歌单编辑器 | 视图层内部未分层，26 处 `innerHTML` 拼接 |
| `js/io.js` | 1186 | 校验 326 行、迁移、IndexedDB、草稿、序列化、下载 | 纯校验与浏览器存储耦合 |
| `js/model.js` | 960 | 数据模型、字体、样式、几何、资产缓存、下载 | 资产层依赖 `URL`/`Image`/`document`，不可在 Node 加载 |
| `js/layout.js` | 904 | 测量、换行、列宽、填充、续表、`devChecks()` 354 行 | 39% 为开发期自检 |
| 其余 8 个文件 | 63–594 | 导入、导出、ZIP、字体、预置、剪贴板 | 拆分合理，保持 |

依赖现状是隐式的：`index.html` 的 `<script>` 顺序是唯一依赖声明；模块间通过 `window.Listify` 命名空间相互引用，`ui` 直接读写 `L.app.state.project`，`app` 又回调 `ui.renderAll()`，形成双向耦合。

已确认的重复/不一致：

- `clamp`：`js/app.js:124` 与 `js/model.js:59` 各一份；
- 深拷贝：`js/app.js:70` 与 `js/io.js:490` 各写一次 `JSON.parse(JSON.stringify())`，而 `model.clone` 已存在；
- 下载：`model.downloadBlob`、`io.downloadProject`、`playlist-export.downloadText` 各自实现触发逻辑；
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

现有模块是 IIFE + `window.Listify`，不能直接 `require`。测试用 Node 内置 `vm` 创建沙箱，注入最小 `window`（`Listify` 命名空间、`devicePixelRatio`、`crypto`）与 `document` 桩（仅 `createElement('canvas')` 的颜色探测所需），按依赖顺序执行源文件，再从沙箱取 `window.Listify`。

- 测试范围优先纯逻辑：`model.virtualWidth`、`sortSongs`、`assignTableSongs`、`layoutCategory`（用固定 `measureText` 桩）、`createDraftEnvelope`、`validateProject`、ZIP 目录结构、字体栈归一化。
- 不为 canvas 绘制、指针交互、IndexedDB 写用例；这些继续用浏览器手工/自动化流程验证。
- 运行方式：`node --test scripts/checks/*.test.js`，不写 `package.json`，不要求 `npm install`。

**备选**：引入 Vitest/Jest——需要 npm，违背零构建与无依赖约束，排除。

### D2. 开发期自检与生产产物隔离

`devChecks()` 迁到 `js/dev-checks.js`，暴露 `L.devChecks()`；`index.html` 不引用该文件；需要时在浏览器控制台手动注入 `<script>` 或由测试装载器执行。`build.sh` 的产物清洁检查增加 `js/dev-checks.js` 黑名单，命中即失败。

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
  ├─ ui-fields / ui-modal / ui-pickers / ui-playlist-editor
  └─ ui ── model, layout, 上述 ui 子模块
        └─ app ── model, layout, render, ui, assets, project-io, draft-store
             ├─ app-viewport
             ├─ app-interactions
             ├─ app-presets
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

把 `js/model.js:712-958` 的 `assets` 缓存、`hashBytes`、`blobToBase64` / `base64ToBlob`、`downloadBlob` 迁到 `js/assets.js`，末尾挂 `L.assets`。`model.js` 保留：

- `uid` / `clamp` / `clone` / `utils`；
- 字体栈解析与样式归一化；
- 背景集/页面/元素工厂与查询；
- 几何（`rotateVector`、`computeImageResize`、`migrateImageRect`）；
- 纯数据辅助（`virtualWidth`、`fontString`）。

迁移后 `model.js` 在 Node 中可直接加载（`document` 颜色探测已有 `typeof document === 'undefined'` 守卫）。

### D6. `ui.js` 拆四块，属性面板暂留

| 新模块 | 内容 | 说明 |
|---|---|---|
| `js/ui-modal.js` | `ui.modal.open / alert / confirm / close`、焦点陷阱、Esc、遮罩 | 已是独立对象，几乎原样搬迁 |
| `js/ui-fields.js` | `esc`、`field`、`fieldPair`、`numberInput`、`textInput`、`colorInput`、`selectInput`、`rangeInput`、`propGroup` 等 | 无状态工厂 |
| `js/ui-pickers.js` | `openBackgroundLibrary`、预设索引加载、`renderPresetGrid`、素材指引链接 | 依赖 `ui.modal`、`L.presets`、`L.app` 动作 |
| `js/ui-playlist-editor.js` | 歌单编辑器弹窗（分类/歌名网格/校验/应用） | 依赖 `ui.modal`、`model` |

`ui.js` 保留侧栏渲染、属性面板、帮助提示、`renderAll` 与事件委托。

### D7. `app.js` 拆五个子域，保留核心编排

按耦合度从低到高拆：

1. `js/app-presets.js`：预置物化、整套/加图/替换、去重命名、深色提示；
2. `js/app-draft.js`：草稿开关、防抖保存、envelope 键、错误上报、启动恢复；
3. `js/app-import-export.js`：歌单导入/导出、项目 JSON 导入/导出、重导入确认；
4. `js/app-interactions.js`：`onPointerDown/Move/Up`、`drag`、`resizeDrag`、`dividerDrag`、`startInlineEditor`、`onDrop`；
5. `js/app-viewport.js`：`setupSurface`、`syncSurface`、`scheduleRedraw`、`flushRedraw`、`applyViewTransform`、`fit`、缩放与滚动同步。

迁移方式：每个子域接收一个显式上下文 `{ state, viewport, actions }`，由 `app.js` 在启动时构造并传入；子域不直接引用另一个子域的内部变量。`app.js` 保留 `state`、选择模型、`changed`、公开动作与 `init`。

**备选**：把 `state` 挂到 `L.app.state` 上供所有子域读写——会扩大可写全局面，违背 D3，排除。

### D8. 状态写入收口（分阶段）

第一阶段只加动作，不删现有直写：

- `L.app.setBackgroundColor(setId, color)`、`setBackgroundImageField(...)`、`setElementField(...)`、`setPageSize(...)` 等；
- `ui.js` 中的直写逐处替换为动作；
- `changed({ property:false, layers })` 保留为局部重绘入口。

验收：`ui.js` 中不再出现 `L.app.state.project.<字段> =` 形式的写入；行为与焦点/滚动表现不变。

### D9. 工具函数唯一实现

新增 `js/util.js`（或复用 `model` 的既有导出）：

- `clamp`、`clone` 从 `model` 导出，`app.js` 删除本地副本；
- 下载统一走 `model.downloadBlob` / `assets.downloadBlob`；
- 字体族引用统一走 `model.quoteFamily`（`fontpicker` 已是此模式，保持）。

### D10. 版本标识单一来源

`build.sh` 在 `inject_version` 后追加：

- 将 `js/app.js` 的 `const BUILD = '...'` 改写为 `VERSION` 值（保留 `L.BUILD` 导出）；
- 或在源码删除手工常量，由构建注入 `window.LISTIFY_BUILD`。

验收：`dist/index.html` 的 `?v=<VERSION>` 与 `dist/js/app.js` 的 `BUILD` 一致；`grep` 不再出现与 `VERSION` 冲突的字面量。

### D11. 执行约束

- 每个拆分步骤独立提交，提交前运行：`node --test scripts/checks/*.test.js`、`./build.sh`、浏览器 `file://` 手工流程（导入、增删页、拖分类、改属性、导出 PNG、刷新恢复草稿）。
- 每步只搬代码与改引用，不顺带改行为、样式、文案。
- 新增文件必须在 `index.html` 中按依赖顺序声明，`build.sh` 自动递归拷贝 `js/`，无需改拷贝逻辑；但产物清洁检查要能发现误入的 `js/dev-checks.js`。
- 拆分完成后 `app.js` / `ui.js` 各不超过 1200 行，其余运行时文件不超过 900 行（`js/presets-data/` 生成数据不计入）。

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

- `L.devChecks()` 是否保留为浏览器公开 API（当前建议保留，但不随产物分发），还是只保留测试装载器入口。
- `app.js` 拆分后是否需要把 `app-viewport` 与 `app-interactions` 合并为一个模块（两者共享 `viewport` 与 `drag`，合并可减少上下文传递，但文件会接近 1200 行上限）。
- 状态收口第二阶段是否值得把 `selection` 也改为动作访问，还是保留为只读快照。