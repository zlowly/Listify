# Proposal

## Why

运行时没有任何自动化回归保护，而维护成本已经集中在少数文件上：`js/app.js`（2944 行 / 162 个函数）与 `js/ui.js`（2650 行 / 108 个函数）合计占运行时代码的 44%，`app.js` 同时承担状态、视口、交互、内容创建、预置应用、导入、草稿与启动；`js/layout.js` 的 904 行里有 354 行是开发期自检 `devChecks()`；`js/io.js` 的 1186 行混合了 326 行手写校验、旧版迁移、IndexedDB、草稿与下载；`js/model.js` 的资产缓存直接依赖 `URL` / `Image` / `document`，纯模型无法在 Node 中加载。

由此带来三个具体风险：

1. **改一处、坏一片**：没有测试套件，任何重构只能靠手工走完整流程，导致团队倾向继续往大文件里追加代码。
2. **约束漂移**：`validateProject()` 与模型默认值各自维护字段约束（`BACKGROUND_FITS`、opacity/blur 范围等），长期必然不一致；`clamp` 在 `app.js` 与 `model.js` 各有一份，深拷贝在 `app.js` 与 `io.js` 各写一次。
3. **发布物不纯净**：`devChecks()` 随生产包分发；`app.js` 的手工构建标识（`20261110b`）与 `index.html` 的缓存参数（`?v=20261110c`）已经不一致。

本变更只做内部结构治理，不改变任何用户可见行为、数据格式或零构建约束。

## What Changes

- **建立零依赖回归安全网**：用 Node 自带 `node:test`（不引入 npm / 第三方库）覆盖纯逻辑——字宽、歌曲排序与填充顺序、动态行数与续表、分页、项目序列化往返、`validateProject` 错误分类、ZIP 打包；用 `vm` 沙箱注入最小 `window`/`document` 桩加载现有 IIFE 模块。
- **开发期自检与生产产物隔离**：`devChecks()` 从 `js/layout.js` 迁到 `js/dev-checks.js`，`index.html` 不加载，`build.sh` 显式拒绝其进入 `dist/`；同时保留浏览器控制台手动自检能力。
- **拆分 `js/io.js`**：拆为 `project-schema.js`（校验 + 旧版迁移，纯函数）、`draft-store.js`（IndexedDB / localStorage / envelope）、`project-io.js`（序列化、文件导入、下载）。校验的字段约束改由 `model` 提供的规范化函数/常量派生，避免双份定义。
- **拆分 `js/model.js` 的资产层**：`assets` 缓存与 Base64/Blob/下载等浏览器 API 迁到 `js/assets.js`，`L.assets` 保持同名兼容；`model.js` 保留数据模型、字体栈、样式归一化与几何计算，成为可在 Node 加载的纯模块。
- **拆分 `js/ui.js`**：拆出 `ui-modal.js`（统一模态框）、`ui-fields.js`（字段工厂）、`ui-pickers.js`（背景库与预置网格）、`ui-playlist-editor.js`；侧栏与属性面板保留在同一文件，避免一次性重排。
- **拆分 `js/app.js` 的低耦合子域**：依次拆出 `app-presets.js`（预置应用链路）、`app-draft.js`（草稿控制器）、`app-import-export.js`（项目/歌单导入导出控制器）、`app-interactions.js`（指针、拖拽、拖放、行内编辑）、`app-viewport.js`（画布表面、重绘调度、缩放与滚动）。视口/交互模块通过显式上下文对象访问 `state`、`viewport` 与公开动作，不把私有状态挂成可写全局。
- **工具函数唯一实现**：`clamp`、`clone`、Blob 下载、字体族引用统一到单一模块；调用方改为复用。
- **状态写入收口（分阶段）**：`ui.js` 不再直接写 `L.app.state.project`，改为调用 `L.app` 的意图方法（如 `setBackgroundColor`、`setElementStyleField`）；第一阶段先加动作并逐处替换，行为不变。
- **版本标识单一来源**：`build.sh` 把 `VERSION` 同时注入 `index.html` 的 `?v=` 与 `js/app.js` 的构建标识（或删除手工常量），保证发布产物内一致。
- **更新文档**：`AGENTS.md`、`README.md` 的目录结构、模块边界与验证命令随拆分同步；新增模块的加载顺序在 `index.html` 中显式声明。

## Capabilities

### New Capabilities

- `code-architecture`：定义运行时模块分层、依赖方向、单文件职责与规模、零构建/经典脚本约束、开发期自检隔离、纯逻辑可测试性、工具函数唯一实现、状态写入方向与版本标识一致性。

### Modified Capabilities

- `release-build`：产物清单显式排除 `js/dev-checks.js` 等开发期自检文件；运行时脚本清单以 `index.html` 实际引用为准，不再硬编码数量；版本注入覆盖 `js/app.js` 的构建标识，保证与 `index.html` 的 `?v=` 一致。

## Impact

- 代码：新增 `js/dev-checks.js`、`js/project-schema.js`、`js/draft-store.js`、`js/project-io.js`、`js/assets.js`、`js/ui-modal.js`、`js/ui-fields.js`、`js/ui-pickers.js`、`js/ui-playlist-editor.js`、`js/app-presets.js`、`js/app-draft.js`、`js/app-import-export.js`、`js/app-interactions.js`、`js/app-viewport.js`、`js/util.js`（或等价最小工具模块）；改动 `js/app.js`、`js/ui.js`、`js/model.js`、`js/io.js`、`js/layout.js`、`index.html`、`build.sh`。
- 测试：新增 `scripts/checks/`（Node 内置 `node:test` 用例 + `vm` 装载器）；仓库仍无 `package.json`、无 npm 依赖、无 CI 要求。
- 构建：`build.sh` 增加产物黑名单校验（`js/dev-checks.js` 不得进入 `dist/`）与构建标识注入；现有 `scripts/`、`presets/` 排除规则不变。
- 数据：项目 JSON 版本保持 3，草稿 schema 不变；无迁移，无用户可见行为变化。
- 约束：零构建、`file://` 直开、经典 `<script>` 顺序加载、无 CDN / 网络 / 包管理器全部保持不变；不拆 `style.css`，不做与结构无关的性能调优。