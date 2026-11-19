# Design

## Context

启动流程见 `js/app.js` 的 `init()`：先 `viewport.setupSurface()` 与 `ui.init()`，随后 `await ctx.draft.restoreDraftOnStartup()`，完成后才 `ui.renderAll()`。`restoreDraftOnStartup()` 内部依次等待 IndexedDB 读取草稿信封、资产记录、项目校验与 `projectIo.buildProject()`；这是项目变大后主要的等待来源。

当前 `index.html` 中的 `#empty-hint` 没有 `hidden` 属性，属于首帧即显示的静态节点。`ui.updateEmptyHint()` 只在 `ui.renderAll()` 中按项目内容切换它，而首次 `renderAll()` 要等草稿恢复结束，因此整个恢复期间用户看到的正是「从左侧导入歌单，再把分类拖到页面上」。仓库要求零构建、经典 `<script defer>`、`file://` 可运行，且不得引入打包器、框架或 CDN。

## Goals / Non-Goals

**Goals:**

- 从首帧开始，在画布中央表达「正在载入」，覆盖整个草稿恢复等待期。
- 载入期间不出现在语义上错误的导入空态；恢复结束后由既有内容/空态逻辑无缝接管。
- 不改变草稿读取、校验、迁移、错误提示与自动保存的时序语义。
- 复用现有画布提示贴的定位、配色与动效偏好规则，保持视觉一致。

**Non-Goals:**

- 不新增载入进度百分比、分阶段进度条或取消载入动作。
- 不改变草稿存储格式、项目 JSON、导出流程或构建脚本。
- 不新增启动阶段的交互锁或并发保护；载入提示只表达状态，不阻断既有的侧栏与顶栏操作。
- 不把载入状态做成顶栏草稿状态的第五种状态。

## Decisions

### 1. 静态 HTML 节点，默认可见；空态提示默认隐藏

在 `#canvas-pane` 内、覆盖画布的位置新增 `#startup-loading`，HTML 中默认可见；同时给 `#empty-hint` 加 `hidden`。这样在 `defer` 脚本执行前就不会先闪出错误的导入引导，而载入提示的 CSS 动效也不依赖 JS 启动。

备选方案：由 JS 在 `ui.init()` 中创建/显示节点。会晚于首帧，正好留下空态闪现窗口，因此不采用。

若 `init()` 抛错导致启动失败，必须在 `boot()` 的 catch 中隐藏载入提示并保留既有 toast，避免永久转圈。

### 2. 视觉：同一中央槽位的「载入贴」，不是第二种空态

载入提示与 `#empty-hint` 使用相同定位（`left: 50%; top: 54%; translate(-50%, -50%)`）、12px 圆角、70% 纸白 + 2px 背景模糊，切换时视觉重心不跳动；但它是载入状态而非空态，因此使用 1px 实线结构线（`--line` / `#e2e6ec`）而不是空态的虚线边框，也不使用 ♫ 图标。

内容为 24px 环形载入指示器 + 13px `--muted` 文案「正在载入本地草稿…」。指示器用 2px 圆环、`--blue` 高亮弧与 `#cbd2dc` 底环，仅用 CSS `transform` 旋转；不引入 SVG 或图标库。z-index 取 5：高于画布 overlay（3/4），低于画布工具条（6），避免遮挡工具条；`pointer-events: none`，不改变交互。

不使用延迟出现的策略（例如 150ms 后才显示）：目标场景就是慢恢复，任何延迟都会先露出空态；快速启动时提示一闪而过比错误引导更可接受。

### 3. 状态切换集中在启动流程，单一入口

在 `ui` 中提供 `ui.setStartupLoading(active)`（或等价方法）：设置 `#startup-loading.hidden`，并同步 `#canvas-pane` 的 `aria-busy`。`init()` 在 `restoreDraftOnStartup()` 与首次 `ui.renderAll()` 外层使用 `try/finally`，`finally` 中关闭载入提示；`boot()` 的 catch 也兜底关闭。这样成功、无草稿、恢复失败三条路径共用同一个收尾点。

载入提示节点自带 `role="status"` 与 `aria-live="polite"`，使文案对辅助技术可见；节点不可聚焦，不抢焦点。隐藏使用 `hidden` 属性（`display: none`），不再保留在可访问性树中。

### 4. 动效遵循减少动效偏好

旋转动画只作用于指示器；`prefers-reduced-motion: reduce` 下停止旋转（`animation: none`），保留圆环与文案。项目已有全局 `prefers-reduced-motion` 规则，但载入指示器需要在停止旋转后仍保持完整可见，因此单独覆盖，不依赖全局 0.01ms 规则。

### 5. 不与导出/持久化耦合

载入提示是编辑界面 DOM，不属于画布或项目数据；PNG 导出基于 canvas 绘制，不包含它。启动结束时它已被移除，因此也无需修改导出路径或 `page.elements`。`index.html` 新增的节点会随 `build.sh` 的复制进入 `dist/`，不需要额外构建配置。

## Risks / Trade-offs

- **无草稿时短暂显示「正在载入本地草稿」** → 首帧无法同步判断 IndexedDB 中是否有草稿；该文案在无草稿时通常只出现很短时间，且不会误导用户去导入。若实测明显，可把文案改为更中性的「正在载入…」，不改变本设计的结构。
- **初始化异常导致载入提示不消失** → 在 `finally` 与 `boot()` catch 两处关闭，避免永久转圈。
- **恢复期间仍可操作侧栏/顶栏，可能与恢复结果竞争** → 本设计明确不引入交互锁；载入提示只负责反馈，保持既有并发语义，避免扩大改动范围。
- **CSS 动画与主线程图片解码竞争** → 指示器只用合成层可动画的 `transform`，不跑 JS 动画循环，尽量不与恢复流程争抢主线程。
- **多一处中央浮层与空态提示的样式重复** → 只复用定位与纸张/墨色变量，不抽公共类；两者语义不同，且各自样式很少，避免为一次性复用引入耦合。
