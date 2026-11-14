# Tasks

## 1. 回归安全网（先做，后续每一步都依赖它）

- [ ] 1.1 新建 `scripts/checks/loader.js`：用 Node 内置 `vm` 创建沙箱，注入最小 `window`（`Listify` 命名空间、`devicePixelRatio`、`crypto`）与 `document` 桩，按 `index.html` 顺序加载运行时脚本并返回 `window.Listify`。验证：`node -e` 加载后 `L.model`、`L.layout`、`L.io` 均存在；不依赖 npm 与网络。
- [ ] 1.2 新建 `scripts/checks/model.test.js`：覆盖 `virtualWidth`（ASCII/CJK/全角/emoji）、`sortSongs` 稳定性、字体栈 `normalizeFontStack` 与 `quoteFamily`、`normalizeMargins`、`clone` 深拷贝。验证：`node --test scripts/checks/model.test.js` 全部通过。
- [ ] 1.3 新建 `scripts/checks/layout.test.js`：用固定 `measureText` 桩覆盖列宽、`assignTableSongs` 的列优先/行优先、动态行数、满页续表与空表占位。验证：断言结果与当前手工基线一致；改动前先记录期望值。
- [ ] 1.4 新建 `scripts/checks/io.test.js`：覆盖 `serializeProjectStructure` 往返、`validateProject` 的版本/重复 ID/缺失资产/无效 fit 等错误分类、`createDraftEnvelope` 不含 base64。验证：合法项目零错误，非法样本返回预期错误消息。
- [ ] 1.5 新建 `scripts/checks/zip.test.js`：覆盖本地文件头、中央目录、CRC32、空目录与多文件条目。验证：解压产物可被 `unzip -t` 校验通过（若本机无 `unzip`，用 Node 解析目录结构断言）。
- [ ] 1.6 在 `scripts/README.md` 增加「回归检查」一节：说明 `node --test scripts/checks/*.test.js` 的用途、零依赖约束、覆盖边界（不含 canvas/交互/IndexedDB）。验证：文档命令可直接执行通过。

## 2. P0 清理

- [ ] 2.1 将 `js/layout.js:520-873` 的 `devChecks()` 迁到 `js/dev-checks.js`，暴露 `L.devChecks()`；`index.html` 不引用；`js/layout.js` 删除该函数与导出。验证：`./build.sh` 后 `dist/` 不含 `js/dev-checks.js`；浏览器手动注入该脚本后可运行 `L.devChecks()`。
- [ ] 2.2 `build.sh` 的 `assert_dist_clean()` 增加 `js/dev-checks.js` 黑名单，命中即失败并提示。验证：临时把该文件复制进 `dist/` 再跑构建检查逻辑（或构造测试），确认失败退出。
- [ ] 2.3 工具去重：删除 `js/app.js` 的本地 `clamp`，改用 `model.clamp`；`app.js:70` 与 `io.js:490` 的 JSON 深拷贝改用 `model.clone`；下载统一走 `model.downloadBlob`。验证：`grep` 中 `function clamp` 仅剩 `model.js` 一处；`node --test` 通过；手工导出项目 JSON 正常。
- [ ] 2.4 版本标识：`build.sh` 在 `inject_version` 后注入 `js/app.js` 的 `BUILD`（或删除常量改为注入 `window.LISTIFY_BUILD`）。验证：把 `VERSION` 改为临时值构建后，`dist/index.html` 的 `?v=` 与 `dist/js/app.js` 的 `BUILD` 一致；源文件不被修改。
- [ ] 2.5 更新 `AGENTS.md`：记录「自检文件不进产物」「工具函数唯一实现」「BUILD 由构建注入」三条约定。验证：文档与脚本行为一致。

## 3. 拆分 `js/io.js`

- [ ] 3.1 新建 `js/project-schema.js`：迁入 `isFiniteNumber`、`validateProject`、`migrateLegacyBackgrounds`、`buildBackgroundSet`、`ownerPage`。`js/io.js` 改为引用；`index.html` 在 `model.js` 后、`io.js` 前声明。验证：`dist` 构建成功；导入旧版项目 JSON 的迁移结果与拆分前一致（用样本文件逐字段对比）。
- [ ] 3.2 新建 `js/draft-store.js`：迁入 IndexedDB 打开/读写、`localStorage` envelope、损坏备份、`restoreDraft`、资产持久化与清理。`js/io.js` 保留薄封装或删除重复实现。验证：刷新恢复草稿、清除 `localStorage` 后降级、损坏草稿备份三条路径行为不变。
- [ ] 3.3 新建 `js/project-io.js`：迁入结构序列化、`serializeProject`、`loadProjectFile`、`buildProject`、`downloadProject`。验证：项目 JSON 导出/导入往返深比较一致；含图项目导出后重新加载图片可用。
- [ ] 3.4 校验约束去重：`validateProject` 的 fit/opacity/blur/margins 范围改由 `model` 的常量与规范化函数派生；错误消息保持中文原文。验证：`node --test scripts/checks/io.test.js` 全部通过；手工导入非法 JSON 的错误提示与拆分前一致。
- [ ] 3.5 拆分完成后确认 `js/io.js` 只保留兼容导出（或删除），`index.html` 引用数量与 `build.sh` 产物校验一致。验证：`wc -l` 单文件不超过 900 行；`file://` 全流程回归。

## 4. 拆分 `js/model.js` 资产层

- [ ] 4.1 新建 `js/assets.js`：迁入 `blobs` / `meta` / `urls` / `images` / `pending`、`hashBytes`、`blobToBase64`、`base64ToBlob`、`downloadBlob`。`index.html` 在 `model.js` 前声明（或拆分为无依赖模块），末尾挂 `L.assets`。验证：上传图片、粘贴图片、预置物化、对象 URL 释放均正常。
- [ ] 4.2 `js/model.js` 删除资产实现，仅保留数据模型、字体、样式、几何；更新所有 `L.assets` 引用点（`app.js`、`ui.js`、`io.js`、`export.js`）。验证：`grep` 无 `model.base64ToBlob` 等旧路径；导出/保存/恢复全流程通过。
- [ ] 4.3 测试装载器在 Node 中直接加载 `model.js`（不注入 `document`），断言 `virtualWidth`、`createDefaultProject`、`computeImageResize` 可用。验证：`node --test scripts/checks/model.test.js` 通过，且无需浏览器桩。

## 5. 拆分 `js/ui.js`

- [ ] 5.1 新建 `js/ui-modal.js`：迁入 `ui.modal` 全套（`open` / `alert` / `confirm` / 关闭、焦点陷阱、Esc、遮罩）。验证：导出弹窗、字体选择、背景库、歌单编辑器四处的打开/关闭/焦点返回不变。
- [ ] 5.2 新建 `js/ui-fields.js`：迁入 `esc`、`field`、`fieldHelp`、`fieldPair`、`propGroup`、`numberInput`、`textInput`、`colorInput`、`selectInput`、`rangeInput`、`weightOptions`、`alignOptions`、`bind`、`valueOf` 等无状态工厂。`ui.js` 改为引用。验证：属性面板所有字段外观与交互不变；`node --test` 中 HTML 转义用例通过。
- [ ] 5.3 新建 `js/ui-pickers.js`：迁入 `openBackgroundLibrary`、预置索引加载、`renderPresetGrid`、`createLocalRow`、`createLinks`、`createHint`。验证：背景库与「选择背景图」弹窗的三个入口、分类标签、懒加载、拖入本地图全部正常。
- [ ] 5.4 新建 `js/ui-playlist-editor.js`：迁入 `ui.playlistEditor.open` 及校验/应用逻辑。验证：编辑分类名、增删歌名、排序、重复校验、未应用修改确认全部正常。
- [ ] 5.5 拆分后 `ui.js` 保留侧栏、属性面板、帮助提示、`renderAll` 与事件委托；`wc -l` 不超过 1200 行。验证：`file://` 全流程回归；属性输入焦点与中文输入不中断。

## 6. 拆分 `js/app.js`

- [ ] 6.1 新建 `js/app-presets.js`：迁入预置物化、整套/加图/替换、去重命名、全局指派、深色提示（约 `app.js:2060-2334`）。通过显式上下文接收 `state`、`assets` 与动作。验证：三个入口 × 背景图/透明图/本地组合全部通过；同一预置两次应用仍 hash 去重。
- [ ] 6.2 新建 `js/app-draft.js`：迁入草稿开关、防抖保存、envelope 键、错误上报、启动恢复（约 `app.js:2484-2677`）。验证：编辑后 300ms 写入、刷新恢复、配额错误提示、资产清理不变。
- [ ] 6.3 新建 `js/app-import-export.js`：迁入歌单导入/导出、项目 JSON 导入/导出、重导入确认（约 `app.js:2334-2484`、`2677-2768`）。验证：UTF-8/GBK/BOM、重复导入确认、项目往返一致。
- [ ] 6.4 新建 `js/app-interactions.js`：迁入指针按下/移动/抬起、各类拖拽、拖放、行内编辑（约 `app.js:958-1333`）。验证：元素/背景图拖动缩放、列宽/边距/页尺寸拖拽、分类拖放、双击编辑全部正常；拖拽帧耗时与拆分前一致。
- [ ] 6.5 新建 `js/app-viewport.js`：迁入画布表面、重绘调度、缩放与滚动（约 `app.js:1-848`）。验证：缩放 10%–400%、适应窗口、滚动同步、窗口 resize、分层重绘与 `drawStats` 计数不变。
- [ ] 6.6 `app.js` 只保留 `state`、选择模型、`changed`、公开动作与 `init`；`wc -l` 不超过 1200 行。验证：`L.app` 公开方法签名不变；`index.html` 加载顺序正确；浏览器无 console 报错。

## 7. 状态写入收口与事件绑定（分阶段）

- [ ] 7.1 新增 `L.app` 意图方法（`setBackgroundColor`、`setBackgroundImageField`、`setElementField`、`setPageSize` 等），保留现有方法。验证：方法可被 `ui.js` 调用，行为与直写一致。
- [ ] 7.2 把 `ui.js` 中的 `L.app.state.project.<字段> =` 写入替换为意图方法，`changed({ property:false, layers })` 保持局部重绘。验证：`grep 'state\.project\.[A-Za-z]* *=' js/ui.js` 无命中；属性输入焦点、滚动位置、撤销行为不变。
- [ ] 7.3 把属性面板中重复的「取值 → 改模型 → 重绘」绑定抽成声明式辅助（可选，若 7.2 后可读性已足够则不做）。验证：字段数量不变，事件委托仍跨 `innerHTML` 重建存活。
- [ ] 7.4 事件委托评估：把 `js/ui.js` 中逐个 `bind` 的静态按钮改为面板级委托（可选）。验证：无重复监听、无焦点丢失；不做则不阻塞本变更归档。

## 8. 构建、文档与集成验证

- [ ] 8.1 `build.sh` 的产物清洁检查覆盖 `js/dev-checks.js`、`scripts/`、`presets/`；版本注入覆盖 `js/app.js` 的 `BUILD`。验证：`./build.sh` 成功，`dist` 中无开发期文件，`?v=` 与 `BUILD` 一致。
- [ ] 8.2 更新 `README.md` 的目录结构与开发约定：列出新增模块、依赖方向、测试命令；更新 `AGENTS.md` 的「Working notes」。验证：文档中的文件清单与 `ls js/` 一致。
- [ ] 8.3 集成回归矩阵（`file://`）：导入 UTF-8/GBK/BOM/重复项样本 → 拖分类 → 增删页 → 改页面/分类/文字/图片/背景属性 → 背景单独套用/加图/替换 → 导出 PNG（当前页/所有页/仅歌单层）→ 导出/导入项目 JSON → 刷新恢复草稿 → 撤销。验证：全流程无 console 报错，输出与拆分前一致。
- [ ] 8.4 量化验收：`node --test scripts/checks/*.test.js` 全部通过；`./build.sh --zip` 成功且产物结构正确；`wc -l js/app.js js/ui.js` 均 ≤1200，其余运行时文件 ≤900（`js/presets-data/` 除外）。
- [ ] 8.5 归档本 change（`/opsx-archive`）：确认 `openspec/specs/code-architecture/spec.md` 已合并、`release-build` delta 已应用、任务全部勾选。

## Workflow follow-up

- 先完成第 1 组并提交，后续每组单独提交；每组提交前运行第 1 组建立的测试与 `./build.sh`。
- 若中途发现行为差异，停止拆分，先补测试再修复，禁止在重构提交中顺带改行为。